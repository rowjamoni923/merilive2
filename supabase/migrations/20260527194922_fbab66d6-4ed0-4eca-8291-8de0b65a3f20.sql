
-- Pkg381: lower auto-approve thresholds so medium-quality cameras pass.
-- Keep gender-vs-account-type as the only hard auto-reject.

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
  v_front_err text;
  v_profile_gender text;
  v_profile_is_host boolean;
  v_expected_gender text;
  v_replay_suspected boolean;
  v_liveness_failed boolean;
  v_profile_mismatch boolean;
  v_duplicate_face boolean;
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

  IF v_replay_suspected THEN
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

  v_face_count := CASE WHEN coalesce(v_auto ->> 'face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'face_count')::int ELSE -1 END;

  IF v_face_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_face_count', 'face_count', v_face_count, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  IF v_front_err <> '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_gender_conf := coalesce(nullif(v_auto ->> 'gender_confidence', '')::numeric, 0);
  v_fl := coalesce(nullif(v_auto ->> 'compare_front_left', '')::numeric, 0);
  v_fr := coalesce(nullif(v_auto ->> 'compare_front_right', '')::numeric, 0);
  v_face_conf := coalesce(nullif(v_auto ->> 'face_confidence', '')::numeric, 0);
  v_age_high := coalesce(nullif(v_auto ->> 'age_range_high', '')::int, 99);
  v_occ := coalesce(nullif(v_auto ->> 'face_occluded_confidence', '')::numeric, 0);
  v_final := lower(trim(coalesce(v_auto ->> 'final_gender', '')));

  IF v_final NOT IN ('male', 'female') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  -- HARD AUTO-REJECT: account type vs detected gender mismatch.
  IF v_expected_gender IN ('male', 'female') AND v_final <> v_expected_gender THEN
    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'expected_gender', v_expected_gender, 'detected_gender', v_final, 'gender_confidence', v_gender_conf, 'manual_review_requested', true);
  END IF;

  -- Pkg381: floors lowered 60 → 50 so medium-quality cameras (blurry/low-light
  -- selfies from average phones) still auto-approve. AWS Rekognition gender at
  -- ≥50% is still meaningful, and the account-type guard above catches genuine
  -- gender mismatch regardless of confidence band.
  IF v_gender_conf < 50 OR v_face_conf < 50 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds',
      'gender_confidence', v_gender_conf, 'face_confidence', v_face_conf,
      'compare_front_left', v_fl, 'compare_front_right', v_fr,
      'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  -- Side-angle similarity: only block if BOTH sides clearly fail (<40%).
  IF v_fl > 0 AND v_fr > 0 AND v_fl < 40 AND v_fr < 40 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'low_similarity', 'compare_front_left', v_fl, 'compare_front_right', v_fr, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
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
      reviewed_at = now(),
      admin_notes = CASE
        WHEN trim(coalesce(admin_notes, '')) = '' THEN
          '[auto Pkg381] service_auto_finalize_face_verification: account type matched live face and required AI checks passed (medium-quality threshold).'
        ELSE
          trim(admin_notes) || E'\n[auto Pkg381] service_auto_finalize_face_verification: account type matched live face and required AI checks passed (medium-quality threshold).'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_final,
    'expected_gender', v_expected_gender,
    'verification_type', v_vt,
    'avatar_set', v_avatar_src IS NOT NULL,
    'compare_front_left', v_fl,
    'compare_front_right', v_fr,
    'manual_review_requested', false
  );
END;
$function$;


-- Legacy fallback path (process_face_verification_v3) — lower the
-- profile-photo-vs-live-face match cut-off from 90 → 75 so medium-quality
-- cameras still auto-approve here too.
CREATE OR REPLACE FUNCTION public.process_face_verification_v3(p_user_id uuid, p_is_match boolean, p_confidence numeric, p_face_rekognition_id text, p_profile_photo_url text, p_live_face_url text DEFAULT NULL::text, p_duplicate_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _submission_id uuid;
  _result jsonb;
  _dup_is_guard_host boolean;
  _auto_ok boolean;
BEGIN
  IF p_duplicate_user_id IS NOT NULL AND p_duplicate_user_id <> p_user_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles d
      WHERE d.id = p_duplicate_user_id AND d.is_host = true
        AND lower(coalesce(d.host_status::text, '')) = 'approved'
        AND coalesce(d.is_face_verified, false) = true
    ) INTO _dup_is_guard_host;

    IF _dup_is_guard_host THEN
      PERFORM public.ban_duplicate_face_user(p_user_id, p_duplicate_user_id, p_confidence, p_face_rekognition_id);
      RETURN jsonb_build_object('isMatch', false, 'confidence', p_confidence,
        'error_code', 'DUPLICATE_FACE', 'duplicate_of', p_duplicate_user_id, 'banned', true);
    END IF;
  END IF;

  -- Pkg381: medium-quality auto-approve gate (was 90, now 75).
  _auto_ok := p_is_match AND p_confidence >= 75;

  INSERT INTO public.face_verification_submissions (
    user_id, face_image_url, profile_image_url, status, match_confidence,
    face_rekognition_id, verification_method, submitted_at, reviewed_at
  ) VALUES (
    p_user_id, COALESCE(p_live_face_url, p_profile_photo_url), p_profile_photo_url,
    CASE WHEN _auto_ok THEN 'approved' ELSE 'rejected' END,
    p_confidence, p_face_rekognition_id, 'rekognition_v3', now(), now()
  ) RETURNING id INTO _submission_id;

  IF _auto_ok THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET is_face_verified = true,
        face_verification_image = COALESCE(p_live_face_url, p_profile_photo_url),
        updated_at = now()
    WHERE id = p_user_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);
    _result := jsonb_build_object('isMatch', true, 'confidence', p_confidence,
      'submission_id', _submission_id, 'status', 'approved',
      'face_rekognition_id', p_face_rekognition_id);
  ELSE
    _result := jsonb_build_object('isMatch', false, 'confidence', p_confidence,
      'submission_id', _submission_id, 'status', 'rejected',
      'error_code', CASE WHEN p_confidence < 75 THEN 'LOW_CONFIDENCE' ELSE 'NO_MATCH' END,
      'error', CASE WHEN p_confidence < 75
                    THEN 'Live face did not closely match the profile photo. Please retake your selfie in good lighting and try again.'
                    ELSE 'Face match failed. Please retake your selfie and try again.' END);
  END IF;

  RETURN _result;
END;
$function$;
