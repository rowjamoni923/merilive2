-- Face verification auto-approval reliability fix
-- Root cause: try_lock_face_submission_for_analysis changed status to 'processing',
-- but face-verification-analyze only accepts pending/submitted/under_review/needs_retry.
-- The analyzer therefore no-oped before running Rekognition/auto-finalize.

-- 1) Keep 'processing' visible as a pending/admin-review bucket for old stuck rows.
CREATE OR REPLACE FUNCTION public.face_verification_status_bucket(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('approved','auto_approved','auto-approved','auto_verified','auto-verified','verified','passed') THEN 'approved'
    WHEN lower(trim(coalesce(_status, ''))) IN ('rejected','auto_rejected','auto-rejected','failed','denied') THEN 'rejected'
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN 'user_retry'
    WHEN lower(trim(coalesce(_status, ''))) IN ('pending','submitted','under_review','processing','applied','in_review','reviewing') THEN 'pending'
    ELSE 'pending'
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO PUBLIC, anon, authenticated, service_role;

-- 2) Make the analyzer lock non-destructive: it records a short metadata lock
-- and increments attempts, but DOES NOT change status to 'processing'.
CREATE OR REPLACE FUNCTION public.try_lock_face_submission_for_analysis(p_submission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _affected integer;
BEGIN
  UPDATE public.face_verification_submissions
     SET rekognition_attempts = COALESCE(rekognition_attempts, 0) + 1,
         ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || jsonb_build_object(
           'analyzer_status', 'processing',
           'analyzer_locked_at', now(),
           'analyzer_locked_until', now() + interval '2 minutes'
         ),
         updated_at = now()
   WHERE id = p_submission_id
     AND COALESCE(status, '') IN ('pending','submitted','under_review','needs_retry','processing')
     AND (
       COALESCE(ai_analysis->>'analyzer_status', '') <> 'processing'
       OR NULLIF(ai_analysis->>'analyzer_locked_until', '') IS NULL
       OR (NULLIF(ai_analysis->>'analyzer_locked_until', ''))::timestamptz < now()
       OR COALESCE(updated_at, created_at) < now() - interval '2 minutes'
     );
  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) TO service_role;

-- 3) Recover any rows left in the old hidden processing state.
UPDATE public.face_verification_submissions
   SET status = 'under_review',
       ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) - 'analyzer_status' - 'analyzer_locked_at' - 'analyzer_locked_until' || jsonb_build_object('processing_state_recovered', true),
       updated_at = now()
 WHERE status = 'processing';

-- 4) Successful auto-finalize must be explicitly labeled as automatic so the
-- admin Auto Approved tab/count is exact.
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
  v_raw_gender text;
  v_detected_gender text;
  v_gender_conflict boolean;
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
  v_photo_live_score numeric;
  v_face_video_live_score numeric;
  v_intro_video_live_score numeric;
  v_host_photos_mismatch boolean;
  v_dup_name text;
  v_dup_uid text;
  v_reject_reason text;
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

  SELECT * INTO v_sub
  FROM public.face_verification_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'submission_not_found');
  END IF;

  IF public.face_verification_status_bucket(v_sub.status) IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wrong_status', 'status', v_sub.status);
  END IF;

  SELECT lower(trim(coalesce(gender, ''))), coalesce(is_host, false)
  INTO v_profile_gender, v_profile_is_host
  FROM public.profiles
  WHERE id = v_sub.user_id;

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

  v_gender_conf := CASE WHEN coalesce(v_auto ->> 'gender_confidence', '') ~ '^-?\d+(\.\d+)?$' THEN (v_auto ->> 'gender_confidence')::numeric ELSE 0 END;
  v_final := lower(trim(coalesce(v_auto ->> 'final_gender', '')));
  v_raw_gender := lower(trim(coalesce(v_auto ->> 'gender_value', '')));
  v_detected_gender := CASE
    WHEN v_raw_gender IN ('male', 'female') THEN v_raw_gender
    WHEN v_final IN ('male', 'female') THEN v_final
    ELSE ''
  END;
  v_gender_conflict := lower(trim(coalesce(v_auto ->> 'gender_conflict', 'false'))) IN ('1','true','t','yes');
  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  v_duplicate_face := coalesce(v_sub.is_duplicate_face, false) OR coalesce(v_sub.ai_analysis ? 'duplicate_account', false);

  IF v_duplicate_face THEN
    v_dup_name := coalesce(v_sub.duplicate_face_name, v_sub.ai_analysis #>> '{duplicate_account,previous_display_name}', 'Existing Account');
    v_dup_uid := coalesce(v_sub.duplicate_face_uid, v_sub.ai_analysis #>> '{duplicate_account,previous_app_uid}', 'Unknown');
    v_reject_reason := format('This face is already registered with another account: %s (ID: %s). One face can only be used for one account. Please contact Support Chat if you believe this is an error.', v_dup_name, v_dup_uid);

    UPDATE public.face_verification_submissions
    SET status = 'rejected',
        verification_method = 'auto_rekognition',
        rejection_reason = v_reject_reason,
        reviewed_at = coalesce(reviewed_at, now()),
        ai_analysis = coalesce(ai_analysis, '{}'::jsonb) - 'analyzer_status' - 'analyzer_locked_at' - 'analyzer_locked_until' || jsonb_build_object('auto_decision','rejected','auto_rejected_at',now(),'auto_reject_reason','duplicate_face'),
        admin_notes = concat_ws(E'\n', nullif(trim(coalesce(admin_notes, '')), ''), format('[auto-reject] duplicate_face DB guard: existing_account_name=%s existing_account_uid=%s', v_dup_name, v_dup_uid)),
        updated_at = now()
    WHERE id = p_submission_id;

    UPDATE public.profiles
    SET is_face_verified = false,
        face_verification_status = 'rejected',
        updated_at = now()
    WHERE id = v_sub.user_id;

    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_face', 'auto_rejected', true, 'manual_review_requested', false, 'expected_gender', v_expected_gender);
  END IF;

  v_manual_flag := lower(trim(coalesce(v_sub.ai_analysis ->> 'manual_review_required', 'false'))) IN ('1','true','t','yes');
  IF v_manual_flag THEN
    RETURN jsonb_build_object('success', false, 'reason', 'client_manual_review_required', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_replay_suspected := lower(trim(coalesce(v_auto ->> 'replay_suspected', 'false'))) IN ('1','true','t','yes');
  v_liveness_failed := lower(trim(coalesce(v_auto ->> 'liveness_failed', 'false'))) IN ('1','true','t','yes');
  v_profile_mismatch := lower(trim(coalesce(v_auto ->> 'profile_mismatch', 'false'))) IN ('1','true','t','yes');
  v_host_photos_mismatch := lower(trim(coalesce(v_auto ->> 'host_photos_mismatch', 'false'))) IN ('1','true','t','yes');
  v_evidence_complete := lower(trim(coalesce(v_auto ->> 'evidence_complete', 'false'))) IN ('1','true','t','yes');
  v_evidence_same_person := lower(trim(coalesce(v_auto ->> 'evidence_same_person', 'false'))) IN ('1','true','t','yes');
  v_identity_mismatch := lower(trim(coalesce(v_auto ->> 'identity_mismatch', 'false'))) IN ('1','true','t','yes');
  v_photo_live_score := CASE WHEN coalesce(v_auto ->> 'photo_live_score', '') ~ '^-?\d+(\.\d+)?$' THEN (v_auto ->> 'photo_live_score')::numeric ELSE NULL END;
  v_face_video_live_score := CASE WHEN coalesce(v_auto ->> 'face_video_live_score', '') ~ '^-?\d+(\.\d+)?$' THEN (v_auto ->> 'face_video_live_score')::numeric ELSE NULL END;
  v_intro_video_live_score := CASE WHEN coalesce(v_auto ->> 'intro_video_live_score', '') ~ '^-?\d+(\.\d+)?$' THEN (v_auto ->> 'intro_video_live_score')::numeric ELSE NULL END;

  IF v_passive_scan AND v_identity_mismatch THEN
    RETURN jsonb_build_object('success', false, 'reason', 'photo_video_live_identity_mismatch', 'manual_review_requested', true, 'expected_gender', v_expected_gender, 'photo_live_score', v_photo_live_score, 'face_video_live_score', v_face_video_live_score, 'intro_video_live_score', v_intro_video_live_score);
  END IF;

  IF v_passive_scan AND (NOT v_evidence_complete OR NOT v_evidence_same_person) THEN
    RETURN jsonb_build_object('success', false, 'reason', CASE WHEN NOT v_evidence_complete THEN 'photo_video_live_evidence_missing' ELSE 'photo_video_live_identity_mismatch' END, 'manual_review_requested', true, 'expected_gender', v_expected_gender, 'photo_live_score', v_photo_live_score, 'face_video_live_score', v_face_video_live_score, 'intro_video_live_score', v_intro_video_live_score);
  END IF;

  IF v_replay_suspected AND NOT v_passive_scan THEN
    RETURN jsonb_build_object('success', false, 'reason', 'replay_suspected', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_liveness_failed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'liveness_failed', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_profile_mismatch THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_face_mismatch', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_host_photos_mismatch THEN
    RETURN jsonb_build_object('success', false, 'reason', 'host_photos_mismatch', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
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

  v_left_err := trim(coalesce(v_auto ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_auto ->> 'right_error', ''));
  IF v_front_err <> '' OR (NOT v_passive_scan AND (v_left_err <> '' OR v_right_err <> '')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'left_error', nullif(v_left_err,''), 'right_error', nullif(v_right_err,''), 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_fl := coalesce(nullif(v_auto ->> 'compare_front_left', '')::numeric, 0);
  v_fr := coalesce(nullif(v_auto ->> 'compare_front_right', '')::numeric, 0);
  v_face_conf := coalesce(nullif(v_auto ->> 'face_confidence', '')::numeric, 0);
  v_age_high := coalesce(nullif(v_auto ->> 'age_range_high', '')::int, 99);
  v_occ := coalesce(nullif(v_auto ->> 'face_occluded_confidence', '')::numeric, 0);
  v_front_yaw := nullif(v_auto ->> 'front_pose_yaw', '')::numeric;
  v_left_yaw := nullif(v_auto ->> 'left_pose_yaw', '')::numeric;
  v_right_yaw := nullif(v_auto ->> 'right_pose_yaw', '')::numeric;

  IF v_face_conf < 70 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds', 'face_confidence', v_face_conf, 'compare_front_left', v_fl, 'compare_front_right', v_fr, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
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

  IF v_occ > 95 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_face_url := coalesce(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
  v_avatar_src := coalesce(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);
  v_vt := CASE WHEN v_expected_gender = 'female' THEN 'host' ELSE 'user' END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = (v_expected_gender = 'female'),
      host_status = CASE WHEN v_expected_gender = 'female' THEN 'approved' ELSE NULL END,
      is_verified = true,
      is_face_verified = true,
      face_verification_image = coalesce(v_face_url, face_verification_image),
      avatar_url = coalesce(v_avatar_src, avatar_url),
      face_verified_at = now(),
      face_verification_status = 'approved',
      updated_at = now()
  WHERE id = v_sub.user_id;

  UPDATE public.face_verification_submissions
  SET status = 'approved',
      verification_type = v_vt,
      verification_method = 'auto_rekognition',
      reviewed_at = now(),
      ai_analysis = coalesce(ai_analysis, '{}'::jsonb) - 'analyzer_status' - 'analyzer_locked_at' - 'analyzer_locked_until' || jsonb_build_object(
        'auto_decision', 'approved',
        'auto_approved_at', now(),
        'auto_finalize', jsonb_build_object(
          'method', 'auto_rekognition',
          'photo_live_score', v_photo_live_score,
          'face_video_live_score', v_face_video_live_score,
          'intro_video_live_score', v_intro_video_live_score,
          'scan_mode', CASE WHEN v_passive_scan THEN 'passive_photo_video_live' ELSE 'pose_challenge' END
        )
      ),
      admin_notes = CASE
        WHEN trim(coalesce(admin_notes, '')) = '' THEN
          '[auto] service_auto_finalize_face_verification: photo+video+live same-person gate, duplicate/liveness/Rekognition checks passed. Gender check disabled per owner policy.'
        ELSE
          trim(admin_notes) || E'\n[auto] service_auto_finalize_face_verification: photo+video+live same-person gate, duplicate/liveness/Rekognition checks passed. Gender check disabled per owner policy.'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_final,
    'expected_gender', v_expected_gender,
    'verification_type', v_vt,
    'verification_method', 'auto_rekognition',
    'scan_mode', CASE WHEN v_passive_scan THEN 'passive_photo_video_live' ELSE 'pose_challenge' END,
    'avatar_set', v_avatar_src IS NOT NULL,
    'compare_front_left', v_fl,
    'compare_front_right', v_fr,
    'photo_live_score', v_photo_live_score,
    'face_video_live_score', v_face_video_live_score,
    'intro_video_live_score', v_intro_video_live_score,
    'manual_review_requested', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.service_auto_finalize_face_verification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_auto_finalize_face_verification(uuid) TO service_role;

-- 5) Sweeper now also recovers old processing rows and re-enqueues them.
CREATE OR REPLACE FUNCTION public.sweep_pending_face_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
  v_refinalized integer := 0;
  v_healed integer := 0;
BEGIN
  UPDATE public.face_verification_submissions
     SET status = 'under_review',
         ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) - 'analyzer_status' - 'analyzer_locked_at' - 'analyzer_locked_until' || jsonb_build_object('processing_state_recovered_by_sweeper', true),
         updated_at = now()
   WHERE status = 'processing'
     AND COALESCE(updated_at, created_at) < now() - interval '2 minutes';

  FOR r IN
    SELECT id
    FROM public.face_verification_submissions
    WHERE COALESCE(status,'') IN ('submitted','pending','under_review')
      AND COALESCE(rekognition_attempts, 0) < 3
      AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
      AND created_at < now() - interval '15 seconds'
      AND created_at > now() - interval '24 hours'
      AND COALESCE(profile_photo_url, front_url, face_image_url, selfie_url) IS NOT NULL
      AND (ai_analysis IS NULL OR (NOT (ai_analysis ? 'rekognition') AND NOT (ai_analysis ? 'autoFinalize')))
    ORDER BY created_at ASC
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public._enqueue_face_analyze(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  FOR r IN
    SELECT id
    FROM public.face_verification_submissions
    WHERE COALESCE(status,'') IN ('needs_retry','under_review')
      AND ai_analysis IS NOT NULL
      AND (ai_analysis ? 'rekognition')
      AND created_at > now() - interval '7 days'
    ORDER BY updated_at DESC
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public.service_auto_finalize_face_verification(r.id);
      v_refinalized := v_refinalized + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  BEGIN
    v_healed := public.service_heal_stuck_face_verifications(75);
  EXCEPTION WHEN OTHERS THEN v_healed := 0;
  END;

  RETURN v_count + v_refinalized + coalesce(v_healed, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_pending_face_verifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_pending_face_verifications() TO service_role;

-- 6) Fix stuck-verification alert: profiles has app_uid, not uid.
CREATE OR REPLACE FUNCTION public.alert_stuck_face_verifications(_threshold_minutes int DEFAULT 10)
RETURNS TABLE(submission_id uuid, user_id uuid, stuck_minutes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
  v_profile record;
  v_last_status text;
  v_minutes int;
  v_already boolean;
BEGIN
  FOR r IN
    SELECT s.id, s.user_id, s.status, s.ai_analysis, s.admin_notes,
           COALESCE(s.updated_at, s.created_at) AS since_ts
    FROM public.face_verification_submissions s
    WHERE s.status IN ('under_review','pending','submitted','processing')
      AND COALESCE(s.updated_at, s.created_at) < now() - make_interval(mins => _threshold_minutes)
  LOOP
    v_minutes := EXTRACT(EPOCH FROM (now() - r.since_ts))::int / 60;

    SELECT EXISTS(
      SELECT 1 FROM public.security_alerts
      WHERE alert_type = 'face_verification_stuck'
        AND is_resolved = false
        AND metadata->>'submission_id' = r.id::text
    ) INTO v_already;
    IF v_already THEN CONTINUE; END IF;

    v_last_status := COALESCE(r.ai_analysis->>'analyzer_status', r.ai_analysis->>'decision', r.ai_analysis->>'status', r.status);

    SELECT username, app_uid INTO v_profile FROM public.profiles WHERE id = r.user_id;

    INSERT INTO public.security_alerts(alert_type, severity, user_id, description, metadata)
    VALUES (
      'face_verification_stuck',
      CASE WHEN v_minutes >= 30 THEN 'high' ELSE 'medium' END,
      r.user_id,
      format('Face verification stuck in %s for %s min (user %s)', r.status, v_minutes, COALESCE(v_profile.username, r.user_id::text)),
      jsonb_build_object(
        'submission_id', r.id,
        'user_id', r.user_id,
        'username', v_profile.username,
        'uid', v_profile.app_uid,
        'submission_status', r.status,
        'analyzer_status', v_last_status,
        'stuck_minutes', v_minutes,
        'since', r.since_ts,
        'admin_notes', r.admin_notes
      )
    );

    INSERT INTO public.admin_notifications(type, title, message, priority, target_role, data)
    VALUES (
      'face_verification_stuck',
      'Face Verification Stuck',
      format('Submission for %s has been in "%s" for %s minutes. Analyzer status: %s', COALESCE(v_profile.username, r.user_id::text), r.status, v_minutes, v_last_status),
      CASE WHEN v_minutes >= 30 THEN 'high' ELSE 'medium' END,
      'admin',
      jsonb_build_object(
        'submission_id', r.id,
        'user_id', r.user_id,
        'username', v_profile.username,
        'uid', v_profile.app_uid,
        'submission_status', r.status,
        'analyzer_status', v_last_status,
        'stuck_minutes', v_minutes,
        'since', r.since_ts
      )
    );

    submission_id := r.id;
    user_id := r.user_id;
    stuck_minutes := v_minutes;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.alert_stuck_face_verifications(int) TO service_role;

-- 7) Re-enqueue recent complete rows that never received Rekognition because of the old lock bug.
SELECT public._enqueue_face_analyze(id)
FROM public.face_verification_submissions
WHERE COALESCE(status,'') IN ('submitted','pending','under_review')
  AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
  AND created_at > now() - interval '24 hours'
  AND COALESCE(profile_photo_url, front_url, face_image_url, selfie_url) IS NOT NULL
  AND (ai_analysis IS NULL OR NOT (ai_analysis ? 'rekognition'));

-- 8) Normalize existing already-approved AI-finalized rows where the auto note exists
-- but verification_method was left as manual, so admin counts are accurate.
UPDATE public.face_verification_submissions
   SET verification_method = 'auto_rekognition',
       ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || jsonb_build_object('auto_decision', 'approved', 'auto_count_repaired_at', now()),
       updated_at = now()
 WHERE public.face_verification_status_bucket(status) = 'approved'
   AND COALESCE(verification_method, 'manual') = 'manual'
   AND lower(coalesce(admin_notes, '')) LIKE '%[auto]%';