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
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role only');
  END IF;

  SELECT setting_value INTO v_enabled
  FROM public.app_settings
  WHERE setting_key = 'face_verification_auto_approve_enabled'
  LIMIT 1;

  IF lower(trim(coalesce(v_enabled, ''))) NOT IN ('1', 'true', 't', 'yes', '"true"') THEN
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

  v_face_count := CASE WHEN coalesce(v_auto ->> 'face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'face_count')::int ELSE -1 END;
  v_left_count := CASE WHEN coalesce(v_auto ->> 'left_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'left_face_count')::int ELSE -1 END;
  v_right_count := CASE WHEN coalesce(v_auto ->> 'right_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'right_face_count')::int ELSE -1 END;

  IF v_face_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_face_count', 'face_count', v_face_count, 'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
  END IF;
  IF v_left_count IS DISTINCT FROM 1 OR v_right_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_side_face_count', 'left_face_count', v_left_count, 'right_face_count', v_right_count, 'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
  END IF;

  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  v_left_err := trim(coalesce(v_auto ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_auto ->> 'right_error', ''));
  IF v_front_err <> '' OR v_left_err <> '' OR v_right_err <> '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'left_error', nullif(v_left_err,''), 'right_error', nullif(v_right_err,''), 'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
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
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender', 'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
  END IF;

  IF v_expected_gender IN ('male', 'female') AND v_final <> v_expected_gender THEN
    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'expected_gender', v_expected_gender, 'detected_gender', v_final, 'gender_confidence', v_gender_conf, 'manual_review_requested', v_manual_flag);
  END IF;

  IF v_gender_conf < 70 OR v_face_conf < 70 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds',
      'gender_confidence', v_gender_conf, 'face_confidence', v_face_conf,
      'compare_front_left', v_fl, 'compare_front_right', v_fr,
      'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
  END IF;

  IF v_fl < 55 OR v_fr < 55 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'low_similarity',
      'compare_front_left', v_fl, 'compare_front_right', v_fr,
      'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
  END IF;

  IF v_front_yaw IS NOT NULL AND v_left_yaw IS NOT NULL AND v_right_yaw IS NOT NULL THEN
    v_left_delta := abs(v_left_yaw - v_front_yaw);
    v_right_delta := abs(v_right_yaw - v_front_yaw);
    v_lr_delta := abs(v_left_yaw - v_right_yaw);
    IF v_left_delta < 3 AND v_right_delta < 3 AND v_lr_delta < 5 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_side_pose',
        'front_pose_yaw', v_front_yaw, 'left_pose_yaw', v_left_yaw, 'right_pose_yaw', v_right_yaw,
        'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
    END IF;
  END IF;

  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage', 'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
  END IF;

  IF v_occ > 95 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded', 'manual_review_requested', v_manual_flag, 'expected_gender', v_expected_gender);
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
          '[auto] service_auto_finalize_face_verification: account type matched live face and Rekognition thresholds passed.'
        ELSE
          trim(admin_notes) || E'\n[auto] service_auto_finalize_face_verification: account type matched live face and Rekognition thresholds passed.'
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
    'manual_review_requested', v_manual_flag
  );
END;
$function$;