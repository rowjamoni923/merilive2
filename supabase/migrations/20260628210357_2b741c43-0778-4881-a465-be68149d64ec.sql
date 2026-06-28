
-- =====================================================================
-- PILLAR 1: Live / Party Room may only close from host End button
-- =====================================================================

-- 1a. Live streams: relax stale auto-close from 35s heartbeat to 24h zombie net.
CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer;
BEGIN
  -- Owner policy 2026-06-28: a live stream may ONLY be ended by the host's
  -- explicit End button or an admin force-close. Heartbeat misses, phone
  -- locks, network drops, and LiveKit reconnects must NOT terminate the row.
  -- This safety net only closes truly abandoned rows (no heartbeat for 24h)
  -- to prevent the table from growing zombie rows indefinitely.
  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '24 hours';
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);
  RETURN closed_count;
END;
$function$;

-- 1b. Party rooms: relax 15-minute idle close to 24h zombie net.
CREATE OR REPLACE FUNCTION public.cleanup_stale_party_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer := 0;
BEGIN
  -- Owner policy 2026-06-28: only owner's explicit "Close Room" ends a party
  -- room. Network blips / background / participant drain do NOT close it.
  -- 24h orphan sweep stays as a zombie safety net only.
  UPDATE public.party_rooms pr
     SET is_active = false,
         ended_at = coalesce(pr.ended_at, now())
   WHERE coalesce(pr.is_active, false) = true
     AND coalesce(pr.updated_at, pr.created_at) < now() - interval '24 hours'
     AND NOT EXISTS (
       SELECT 1 FROM public.party_room_participants p2
        WHERE p2.room_id = pr.id
          AND p2.left_at IS NULL
          AND coalesce(p2.last_seen_at, p2.joined_at) > now() - interval '6 hours'
     );

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$function$;

-- 1c. LiveKit room_finished webhook: stop closing live_streams + party_rooms
--      automatically. Keep private_calls auto-close (calls have a different
--      lifecycle — both sides leave = call truly ended).
CREATE OR REPLACE FUNCTION public.auto_close_room_from_livekit(_room_name text)
RETURNS TABLE(closed_kind text, closed_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id text;
BEGIN
  IF _room_name IS NULL THEN RETURN; END IF;

  -- Owner policy 2026-06-28: live_streams and party_rooms are NEVER closed
  -- from a LiveKit room_finished event. Only the host's End button (or admin
  -- force-close) may flip is_active=false. We still log the call for audit.
  IF _room_name LIKE 'live_%' OR _room_name LIKE 'party_%' THEN
    RETURN;
  END IF;

  IF _room_name LIKE 'call_%' THEN
    v_id := substring(_room_name FROM 6);
    BEGIN
      UPDATE public.private_calls
         SET status   = 'ended',
             ended_at = COALESCE(ended_at, now())
       WHERE id::text = v_id
         AND status <> 'ended';
      IF FOUND THEN
        closed_kind := 'private_call'; closed_id := v_id; RETURN NEXT;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN;
END;
$function$;

-- =====================================================================
-- PILLAR 2: Admin reports — instant realtime delivery
-- =====================================================================
DO $$
DECLARE
  t text;
  report_tables text[] := ARRAY[
    'user_reports',
    'reel_reports',
    'support_reports',
    'support_tickets',
    'support_messages',
    'host_contact_violations',
    'live_face_violations',
    'chat_moderation_logs',
    'host_conversion_requests'
  ];
BEGIN
  FOREACH t IN ARRAY report_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- PILLAR 3: 95% auto-approve for genuine face verification
-- =====================================================================
CREATE OR REPLACE FUNCTION public.service_auto_finalize_face_verification(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.face_verification_submissions%ROWTYPE;
  v_auto jsonb;
  v_manual_flag boolean;
  v_gender_conf numeric;
  v_fl numeric;
  v_fr numeric;
  v_face_conf numeric;
  v_age_high int;
  v_occ numeric;
  v_final text;
  v_enabled text;
  v_face_url text;
  v_avatar_src text;
  v_vt text;
  v_face_count int;
  v_left_count int;
  v_right_count int;
  v_front_err text;
  v_left_err text;
  v_right_err text;
  v_front_yaw numeric;
  v_left_yaw numeric;
  v_right_yaw numeric;
  v_left_delta numeric;
  v_right_delta numeric;
  v_lr_delta numeric;
  v_profile_gender text;
  v_profile_is_host boolean;
  v_expected_gender text;
  v_replay_suspected boolean;
  v_liveness_failed boolean;
  v_profile_mismatch boolean;
  v_duplicate_face boolean;
  v_passive_scan boolean;
  v_evidence_complete boolean;
  v_evidence_same_person boolean;
  v_identity_mismatch boolean;
  v_host_photos text[];
  v_full_name text;
  v_language text;
  v_age int;
  v_photo_live numeric;
  v_face_video_live numeric;
  v_strong_identity boolean;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role only');
  END IF;

  SELECT setting_value::text INTO v_enabled
  FROM public.app_settings
  WHERE setting_key = 'face_verification_auto_approve_enabled'
  LIMIT 1;

  IF lower(trim(both '"' from trim(coalesce(v_enabled, '')))) NOT IN ('1', 'true', 't', 'yes') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'auto_disabled');
  END IF;

  SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'submission_not_found');
  END IF;

  IF public.face_verification_status_bucket(v_sub.status) IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wrong_status', 'status', v_sub.status);
  END IF;

  SELECT lower(trim(coalesce(gender, ''))), coalesce(is_host, false)
  INTO v_profile_gender, v_profile_is_host
  FROM public.profiles WHERE id = v_sub.user_id;

  v_expected_gender := CASE
    WHEN lower(trim(coalesce(v_sub.verification_type, ''))) = 'host' THEN 'female'
    WHEN lower(trim(coalesce(v_sub.verification_type, ''))) IN ('user', 'face') THEN 'male'
    WHEN v_profile_gender IN ('male', 'female') THEN v_profile_gender
    WHEN v_profile_is_host THEN 'female'
    ELSE 'male'
  END;

  v_auto := coalesce(v_sub.ai_analysis, '{}'::jsonb) -> 'rekognition';
  v_passive_scan := coalesce(v_sub.ai_analysis ->> 'scan_mode', '') = 'passive_photo_video_live';

  IF v_auto IS NULL OR v_auto = 'null'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_rekognition_block', 'expected_gender', v_expected_gender);
  END IF;

  v_manual_flag := lower(trim(coalesce(v_sub.ai_analysis ->> 'manual_review_required', 'false'))) IN ('1','true','t','yes');
  IF v_manual_flag THEN
    RETURN jsonb_build_object('success', false, 'reason', 'client_manual_review_required', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_replay_suspected := lower(trim(coalesce(v_auto ->> 'replay_suspected', 'false'))) IN ('1','true','t','yes');
  v_liveness_failed := lower(trim(coalesce(v_auto ->> 'liveness_failed', 'false'))) IN ('1','true','t','yes');
  v_profile_mismatch := lower(trim(coalesce(v_auto ->> 'profile_mismatch', 'false'))) IN ('1','true','t','yes');
  v_duplicate_face := coalesce(v_sub.is_duplicate_face, false) OR coalesce(v_sub.ai_analysis ? 'duplicate_account', false);
  v_evidence_complete := lower(trim(coalesce(v_auto ->> 'evidence_complete', 'false'))) IN ('1','true','t','yes');
  v_evidence_same_person := lower(trim(coalesce(v_auto ->> 'evidence_same_person', 'false'))) IN ('1','true','t','yes');
  v_identity_mismatch := lower(trim(coalesce(v_auto ->> 'identity_mismatch', 'false'))) IN ('1','true','t','yes');

  -- Hard rejects unchanged.
  IF v_replay_suspected AND NOT v_passive_scan THEN
    RETURN jsonb_build_object('success', false, 'reason', 'replay_suspected', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_liveness_failed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'liveness_failed', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_profile_mismatch THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_face_mismatch', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_duplicate_face THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_face', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  IF v_passive_scan AND (NOT v_evidence_complete OR NOT v_evidence_same_person OR v_identity_mismatch) THEN
    RETURN jsonb_build_object('success', false,
      'reason', CASE WHEN v_identity_mismatch THEN 'photo_video_live_identity_mismatch' ELSE 'photo_video_live_evidence_missing' END,
      'manual_review_requested', true,
      'evidence_complete', v_evidence_complete, 'evidence_same_person', v_evidence_same_person,
      'expected_gender', v_expected_gender);
  END IF;

  v_face_count := CASE WHEN coalesce(v_auto ->> 'face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'face_count')::int ELSE -1 END;
  v_left_count := CASE WHEN coalesce(v_auto ->> 'left_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'left_face_count')::int ELSE -1 END;
  v_right_count := CASE WHEN coalesce(v_auto ->> 'right_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'right_face_count')::int ELSE -1 END;

  IF v_face_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_face_count', 'face_count', v_face_count, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF NOT v_passive_scan AND (v_left_count IS DISTINCT FROM 1 OR v_right_count IS DISTINCT FROM 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_side_face_count', 'left_face_count', v_left_count, 'right_face_count', v_right_count, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  v_left_err := trim(coalesce(v_auto ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_auto ->> 'right_error', ''));
  IF v_front_err <> '' OR (NOT v_passive_scan AND (v_left_err <> '' OR v_right_err <> '')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'left_error', nullif(v_left_err,''), 'right_error', nullif(v_right_err,''), 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_gender_conf := coalesce(nullif(v_auto ->> 'gender_confidence', '')::numeric, 0);
  v_fl := coalesce(nullif(v_auto ->> 'compare_front_left', '')::numeric, 0);
  v_fr := coalesce(nullif(v_auto ->> 'compare_front_right', '')::numeric, 0);
  v_face_conf := coalesce(nullif(v_auto ->> 'face_confidence', '')::numeric, 0);
  v_age_high := coalesce(nullif(v_auto ->> 'age_range_high', '')::int, 99);
  v_occ := coalesce(nullif(v_auto ->> 'face_occluded_confidence', '')::numeric, 0);
  v_final := lower(trim(coalesce(v_auto ->> 'final_gender', '')));
  v_front_yaw := nullif(v_auto ->> 'front_pose_yaw', '')::numeric;
  v_left_yaw := nullif(v_auto ->> 'left_pose_yaw', '')::numeric;
  v_right_yaw := nullif(v_auto ->> 'right_pose_yaw', '')::numeric;
  v_photo_live := coalesce(nullif(v_auto ->> 'photo_live_score', '')::numeric, 0);
  v_face_video_live := coalesce(nullif(v_auto ->> 'face_video_live_score', '')::numeric, 0);

  -- Owner policy 2026-06-28 (PHASE 2 — 95% target): strong identity now triggers
  -- if EITHER photo↔live OR face-video↔live ≥ 75 (was both ≥ 85). This single
  -- change is the biggest auto-approve lift — one good biometric proof is enough
  -- to skip the soft-signal gauntlet (gender confidence, face confidence,
  -- occlusion). Hard rejects (duplicate, gender mismatch, liveness fail) keep
  -- their own dedicated checks above.
  v_strong_identity := v_passive_scan
    AND v_evidence_complete
    AND v_evidence_same_person
    AND NOT v_identity_mismatch
    AND (v_photo_live >= 75 OR v_face_video_live >= 75);

  IF v_final NOT IN ('male', 'female') THEN
    -- Unknown detected gender on strong-identity match is no longer a blocker.
    IF NOT v_strong_identity THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
    END IF;
  ELSIF v_expected_gender IN ('male', 'female') AND v_final <> v_expected_gender THEN
    -- HARD reject: account gender vs detected gender (kept).
    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'expected_gender', v_expected_gender, 'detected_gender', v_final, 'gender_confidence', v_gender_conf, 'manual_review_requested', true);
  END IF;

  -- Soft floors only apply when there is NO strong identity proof.
  IF NOT v_strong_identity THEN
    IF v_gender_conf < 50 OR v_face_conf < 45 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds', 'gender_confidence', v_gender_conf, 'face_confidence', v_face_conf, 'compare_front_left', v_fl, 'compare_front_right', v_fr, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
    END IF;
  END IF;

  IF NOT v_passive_scan AND (v_fl < 55 OR v_fr < 55) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'low_similarity', 'compare_front_left', v_fl, 'compare_front_right', v_fr, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF NOT v_passive_scan AND v_front_yaw IS NOT NULL AND v_left_yaw IS NOT NULL AND v_right_yaw IS NOT NULL THEN
    v_left_delta := abs(v_left_yaw - v_front_yaw);
    v_right_delta := abs(v_right_yaw - v_front_yaw);
    v_lr_delta := abs(v_left_yaw - v_right_yaw);
    IF v_left_delta < 8 AND v_right_delta < 8 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_side_pose', 'front_pose_yaw', v_front_yaw, 'left_pose_yaw', v_left_yaw, 'right_pose_yaw', v_right_yaw, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
    END IF;
    IF v_lr_delta < 12 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_left_right_pose_gap', 'front_pose_yaw', v_front_yaw, 'left_pose_yaw', v_left_yaw, 'right_pose_yaw', v_right_yaw, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
    END IF;
  END IF;
  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  -- Occlusion never blocks anymore when strong identity holds (hair / glasses /
  -- beauty filters were the dominant false-retry driver).
  IF v_occ > 98 AND NOT v_strong_identity THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded', 'manual_review_requested', true, 'expected_gender', v_expected_gender, 'face_occluded_confidence', v_occ);
  END IF;

  v_face_url := coalesce(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
  v_avatar_src := coalesce(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);
  v_vt := CASE WHEN v_expected_gender = 'female' THEN 'host' ELSE 'user' END;

  IF v_sub.host_photos IS NOT NULL THEN
    SELECT array_agg(u) INTO v_host_photos
    FROM (SELECT unnest(v_sub.host_photos) AS u) s
    WHERE u IS NOT NULL AND length(trim(u)) > 0;
  END IF;

  v_full_name := nullif(trim(coalesce(v_sub.full_name, '')), '');
  v_language  := nullif(trim(coalesce(v_sub.language, '')), '');
  v_age       := v_sub.age;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = (v_expected_gender = 'female'),
      host_status = CASE WHEN v_expected_gender = 'female' THEN 'approved' ELSE NULL END,
      is_verified = true,
      is_face_verified = true,
      face_verification_image = coalesce(v_face_url, face_verification_image),
      avatar_url = coalesce(v_avatar_src, avatar_url),
      profile_photo_url = coalesce(v_avatar_src, profile_photo_url),
      host_photos = CASE
        WHEN v_host_photos IS NOT NULL AND array_length(v_host_photos, 1) > 0
          THEN v_host_photos
        ELSE host_photos
      END,
      display_name = coalesce(v_full_name, display_name),
      age = coalesce(v_age, age),
      language = coalesce(v_language, language),
      host_verified_at = CASE
        WHEN v_expected_gender = 'female' THEN now()
        ELSE host_verified_at
      END,
      face_verified_at = now(),
      face_verification_status = 'approved',
      updated_at = now()
  WHERE id = v_sub.user_id;

  UPDATE public.face_verification_submissions
  SET status = 'approved',
      verification_type = v_vt,
      reviewed_at = now(),
      admin_notes = CASE
        WHEN trim(coalesce(admin_notes, '')) = '' THEN
          '[auto] service_auto_finalize_face_verification: approved (95% policy 2026-06-28).'
        ELSE
          trim(admin_notes) || E'\n[auto] service_auto_finalize_face_verification: approved (95% policy 2026-06-28, strong_identity=' || v_strong_identity::text || ').'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_final,
    'expected_gender', v_expected_gender,
    'verification_type', v_vt,
    'scan_mode', CASE WHEN v_passive_scan THEN 'passive_photo_video_live' ELSE 'pose_challenge' END,
    'avatar_set', v_avatar_src IS NOT NULL,
    'host_photos_published', coalesce(array_length(v_host_photos, 1), 0),
    'strong_identity', v_strong_identity,
    'photo_live_score', v_photo_live,
    'face_video_live_score', v_face_video_live,
    'gender_confidence', v_gender_conf,
    'face_confidence', v_face_conf,
    'face_occluded_confidence', v_occ,
    'basic_info_published', jsonb_build_object(
      'display_name', v_full_name IS NOT NULL,
      'age', v_age IS NOT NULL,
      'language', v_language IS NOT NULL
    ),
    'compare_front_left', v_fl,
    'compare_front_right', v_fr,
    'evidence_complete', v_evidence_complete,
    'evidence_same_person', v_evidence_same_person,
    'manual_review_requested', false
  );
END;
$function$;
