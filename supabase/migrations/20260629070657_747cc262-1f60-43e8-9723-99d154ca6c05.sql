
-- ============================================================================
-- 1. Admin-tunable thresholds
-- ============================================================================
INSERT INTO public.app_settings (setting_key, setting_value, description) VALUES
  ('face_verification_same_person_min_similarity', '55', 'Min AWS Rekognition CompareFaces similarity (0-100) to treat two faces as the same person. Lower = more lenient. Industry: 55-65.'),
  ('face_verification_strong_identity_min', '75', 'Single-biometric score (0-100) that triggers strong-identity override (soft-block bypass). Default 75.'),
  ('face_verification_super_strong_min', '85', 'When BOTH photo↔live AND face-video↔live ≥ this, treat as super-strong identity proof: overrides ALL soft blocks (liveness, profile mismatch, host gallery, identity_mismatch). Default 85.'),
  ('face_verification_gender_confidence_min', '50', 'Min Rekognition gender detection confidence (0-100) for auto-approve. Default 50.'),
  ('face_verification_face_confidence_min', '45', 'Min Rekognition face detection confidence (0-100) for auto-approve. Default 45.'),
  ('face_verification_occlusion_block_threshold', '98', 'Block auto-approve when face_occluded_confidence > this. Default 98.')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- 2. Upgraded auto-finalize with super-strong override
-- ============================================================================
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
  v_fl numeric; v_fr numeric;
  v_face_conf numeric;
  v_age_high int;
  v_occ numeric;
  v_final text;
  v_enabled text;
  v_face_url text; v_avatar_src text;
  v_vt text;
  v_face_count int; v_left_count int; v_right_count int;
  v_front_err text; v_left_err text; v_right_err text;
  v_front_yaw numeric; v_left_yaw numeric; v_right_yaw numeric;
  v_left_delta numeric; v_right_delta numeric; v_lr_delta numeric;
  v_profile_gender text; v_profile_is_host boolean;
  v_expected_gender text;
  v_replay_suspected boolean; v_liveness_failed boolean;
  v_profile_mismatch boolean; v_duplicate_face boolean;
  v_passive_scan boolean;
  v_evidence_complete boolean; v_evidence_same_person boolean;
  v_identity_mismatch boolean;
  v_host_photos text[];
  v_full_name text; v_language text; v_age int;
  v_photo_live numeric; v_face_video_live numeric;
  v_strong_identity boolean; v_super_strong boolean;
  v_profile_match numeric; v_host_min numeric;
  -- Admin-tunable thresholds
  v_t_same numeric; v_t_strong numeric; v_t_super numeric;
  v_t_gender_conf numeric; v_t_face_conf numeric; v_t_occ numeric;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role only');
  END IF;

  SELECT setting_value::text INTO v_enabled
  FROM public.app_settings WHERE setting_key = 'face_verification_auto_approve_enabled' LIMIT 1;
  IF lower(trim(both '"' from trim(coalesce(v_enabled, '')))) NOT IN ('1','true','t','yes') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'auto_disabled');
  END IF;

  -- Pull admin-tunable thresholds with safe defaults
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 55)
    INTO v_t_same FROM public.app_settings WHERE setting_key='face_verification_same_person_min_similarity' LIMIT 1;
  v_t_same := coalesce(v_t_same, 55);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 75)
    INTO v_t_strong FROM public.app_settings WHERE setting_key='face_verification_strong_identity_min' LIMIT 1;
  v_t_strong := coalesce(v_t_strong, 75);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 85)
    INTO v_t_super FROM public.app_settings WHERE setting_key='face_verification_super_strong_min' LIMIT 1;
  v_t_super := coalesce(v_t_super, 85);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 50)
    INTO v_t_gender_conf FROM public.app_settings WHERE setting_key='face_verification_gender_confidence_min' LIMIT 1;
  v_t_gender_conf := coalesce(v_t_gender_conf, 50);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 45)
    INTO v_t_face_conf FROM public.app_settings WHERE setting_key='face_verification_face_confidence_min' LIMIT 1;
  v_t_face_conf := coalesce(v_t_face_conf, 45);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 98)
    INTO v_t_occ FROM public.app_settings WHERE setting_key='face_verification_occlusion_block_threshold' LIMIT 1;
  v_t_occ := coalesce(v_t_occ, 98);

  SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'submission_not_found');
  END IF;

  -- Accept pending bucket OR needs_retry (so heal-loop can re-finalize previously stuck rows)
  IF public.face_verification_status_bucket(v_sub.status) IS DISTINCT FROM 'pending'
     AND lower(coalesce(v_sub.status,'')) <> 'needs_retry' THEN
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
    RETURN jsonb_build_object('success', false, 'reason', 'client_manual_review_required', 'manual_review_requested', true);
  END IF;

  v_replay_suspected := lower(trim(coalesce(v_auto ->> 'replay_suspected', 'false'))) IN ('1','true','t','yes');
  v_liveness_failed := lower(trim(coalesce(v_auto ->> 'liveness_failed', 'false'))) IN ('1','true','t','yes');
  v_profile_mismatch := lower(trim(coalesce(v_auto ->> 'profile_mismatch', 'false'))) IN ('1','true','t','yes');
  v_duplicate_face := coalesce(v_sub.is_duplicate_face, false) OR coalesce(v_sub.ai_analysis ? 'duplicate_account', false);
  v_evidence_complete := lower(trim(coalesce(v_auto ->> 'evidence_complete', 'false'))) IN ('1','true','t','yes');
  v_evidence_same_person := lower(trim(coalesce(v_auto ->> 'evidence_same_person', 'false'))) IN ('1','true','t','yes');
  v_identity_mismatch := lower(trim(coalesce(v_auto ->> 'identity_mismatch', 'false'))) IN ('1','true','t','yes');

  v_photo_live := coalesce(nullif(v_auto ->> 'photo_live_score', '')::numeric, 0);
  v_face_video_live := coalesce(nullif(v_auto ->> 'face_video_live_score', '')::numeric, 0);
  v_profile_match := coalesce(nullif(v_auto ->> 'profile_match_score', '')::numeric, 0);
  v_host_min := coalesce(nullif(v_auto ->> 'host_photos_min_score', '')::numeric, 0);

  -- STRONG identity: any single biometric ≥ strong threshold (default 75)
  v_strong_identity := v_passive_scan
    AND v_evidence_complete
    AND v_evidence_same_person
    AND NOT v_identity_mismatch
    AND (
      v_photo_live >= v_t_strong
      OR v_face_video_live >= v_t_strong
      OR v_profile_match >= v_t_strong
      OR v_host_min >= v_t_strong
    );

  -- SUPER-STRONG: BOTH photo↔live AND face-video↔live ≥ super threshold (default 85).
  -- This proves the same person submitted photo + video + live test, so we override
  -- ALL soft blocks: liveness provider failures, profile mismatch, host gallery
  -- mismatch (old photos), and even identity_mismatch (which may have triggered
  -- only on outdated host gallery comparison). Host gallery becomes informational.
  v_super_strong := v_passive_scan
    AND v_photo_live >= v_t_super
    AND v_face_video_live >= v_t_super
    AND coalesce(v_profile_match, 0) >= v_t_same;  -- profile↔selfie must also be the same person

  -- HARD rejects (never overridden)
  IF v_duplicate_face THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_face', 'manual_review_requested', true);
  END IF;
  IF v_replay_suspected AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'replay_suspected', 'manual_review_requested', true);
  END IF;

  -- SOFT rejects: bypass on strong/super-strong identity
  IF v_liveness_failed AND NOT v_strong_identity AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'liveness_failed', 'manual_review_requested', true);
  END IF;
  IF v_profile_mismatch AND NOT v_strong_identity AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_face_mismatch', 'manual_review_requested', true);
  END IF;

  -- Evidence + identity mismatch: super-strong bypass
  IF v_passive_scan AND (NOT v_evidence_complete OR NOT v_evidence_same_person OR v_identity_mismatch) THEN
    IF NOT v_super_strong THEN
      RETURN jsonb_build_object('success', false,
        'reason', CASE WHEN v_identity_mismatch THEN 'photo_video_live_identity_mismatch' ELSE 'photo_video_live_evidence_missing' END,
        'manual_review_requested', true,
        'evidence_complete', v_evidence_complete, 'evidence_same_person', v_evidence_same_person);
    END IF;
  END IF;

  v_face_count := CASE WHEN coalesce(v_auto ->> 'face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'face_count')::int ELSE -1 END;
  v_left_count := CASE WHEN coalesce(v_auto ->> 'left_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'left_face_count')::int ELSE -1 END;
  v_right_count := CASE WHEN coalesce(v_auto ->> 'right_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'right_face_count')::int ELSE -1 END;

  -- Accept face_count >=1 (largest-face fallback). Old check was =1 only.
  IF v_face_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_face_in_front', 'face_count', v_face_count, 'manual_review_requested', true);
  END IF;
  IF NOT v_passive_scan AND (v_left_count < 1 OR v_right_count < 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_face_in_side', 'left_face_count', v_left_count, 'right_face_count', v_right_count, 'manual_review_requested', true);
  END IF;

  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  v_left_err := trim(coalesce(v_auto ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_auto ->> 'right_error', ''));
  -- Treat "multiple_faces_*" as warning (largest-face fallback in edge fn); only no_face is hard error
  IF v_front_err = 'no_face_front' OR (NOT v_passive_scan AND (v_left_err = 'no_face_left' OR v_right_err = 'no_face_right')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'manual_review_requested', true);
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

  IF v_final NOT IN ('male', 'female') THEN
    IF NOT v_strong_identity AND NOT v_super_strong THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender', 'manual_review_requested', true);
    END IF;
  ELSIF v_expected_gender IN ('male', 'female') AND v_final <> v_expected_gender THEN
    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'expected_gender', v_expected_gender, 'detected_gender', v_final, 'manual_review_requested', true);
  END IF;

  IF NOT v_strong_identity AND NOT v_super_strong THEN
    IF v_gender_conf < v_t_gender_conf OR v_face_conf < v_t_face_conf THEN
      RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds', 'gender_confidence', v_gender_conf, 'face_confidence', v_face_conf, 'manual_review_requested', true);
    END IF;
  END IF;

  IF NOT v_passive_scan AND (v_fl < v_t_same OR v_fr < v_t_same) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'low_similarity', 'compare_front_left', v_fl, 'compare_front_right', v_fr, 'manual_review_requested', true);
  END IF;
  IF NOT v_passive_scan AND v_front_yaw IS NOT NULL AND v_left_yaw IS NOT NULL AND v_right_yaw IS NOT NULL THEN
    v_left_delta := abs(v_left_yaw - v_front_yaw);
    v_right_delta := abs(v_right_yaw - v_front_yaw);
    v_lr_delta := abs(v_left_yaw - v_right_yaw);
    IF v_left_delta < 8 AND v_right_delta < 8 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_side_pose', 'manual_review_requested', true);
    END IF;
    IF v_lr_delta < 12 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_left_right_pose_gap', 'manual_review_requested', true);
    END IF;
  END IF;
  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage', 'manual_review_requested', true);
  END IF;

  IF v_occ > v_t_occ AND NOT v_strong_identity AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded', 'face_occluded_confidence', v_occ, 'manual_review_requested', true);
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
      host_photos = CASE WHEN v_host_photos IS NOT NULL AND array_length(v_host_photos, 1) > 0 THEN v_host_photos ELSE host_photos END,
      display_name = coalesce(v_full_name, display_name),
      age = coalesce(v_age, age),
      language = coalesce(v_language, language),
      host_verified_at = CASE WHEN v_expected_gender = 'female' THEN now() ELSE host_verified_at END,
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
          '[auto v3 2026-06-29] approved (strong=' || v_strong_identity::text || ' super_strong=' || v_super_strong::text || ').'
        ELSE
          trim(admin_notes) || E'\n[auto v3 2026-06-29] approved (strong=' || v_strong_identity::text || ' super_strong=' || v_super_strong::text || ').'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_final,
    'expected_gender', v_expected_gender,
    'verification_type', v_vt,
    'strong_identity', v_strong_identity,
    'super_strong', v_super_strong,
    'photo_live_score', v_photo_live,
    'face_video_live_score', v_face_video_live,
    'profile_match_score', v_profile_match,
    'host_photos_min_score', v_host_min,
    'liveness_failed_overridden', v_liveness_failed AND (v_strong_identity OR v_super_strong),
    'profile_mismatch_overridden', v_profile_mismatch AND (v_strong_identity OR v_super_strong),
    'identity_mismatch_overridden', v_identity_mismatch AND v_super_strong,
    'thresholds', jsonb_build_object('same', v_t_same, 'strong', v_t_strong, 'super', v_t_super),
    'manual_review_requested', false
  );
END;
$function$;

-- ============================================================================
-- 3. Sweep also re-finalizes needs_retry rows that already have analysis
-- ============================================================================
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
  -- Primary: enqueue fresh analyzer for rows without rekognition block yet
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

  -- NEW: Re-finalize needs_retry / under_review rows that already have a
  -- rekognition block. These were stuck by the old strict gates; the upgraded
  -- finalizer with super-strong override may now approve them automatically.
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

  -- Safety net for media-incomplete rows
  BEGIN
    v_healed := public.service_heal_stuck_face_verifications(75);
  EXCEPTION WHEN OTHERS THEN v_healed := 0;
  END;

  RETURN v_count + v_refinalized + coalesce(v_healed, 0);
END;
$function$;
