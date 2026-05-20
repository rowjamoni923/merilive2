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
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role only');
  END IF;

  SELECT setting_value INTO v_enabled
  FROM public.app_settings
  WHERE setting_key = 'face_verification_auto_approve_enabled'
  LIMIT 1;

  IF lower(trim(coalesce(v_enabled, ''))) NOT IN ('1', 'true', 't', 'yes') THEN
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

  -- ★ Respect client-side manual-review request (faceManualReviewRequired in UI).
  v_manual_flag := coalesce((coalesce(v_sub.ai_analysis, '{}'::jsonb) ->> 'manual_review_required')::boolean, false);
  IF v_manual_flag THEN
    RETURN jsonb_build_object('success', false, 'reason', 'manual_review_required');
  END IF;

  v_auto := coalesce(v_sub.ai_analysis, '{}'::jsonb) -> 'rekognition';
  IF v_auto IS NULL OR v_auto = 'null'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_rekognition_block');
  END IF;

  v_face_count := coalesce((v_auto ->> 'face_count')::int, -1);
  IF v_face_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_face_count', 'face_count', v_face_count);
  END IF;

  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  IF v_front_err <> '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'front_error', 'detail', v_front_err);
  END IF;

  v_gender_conf := coalesce((v_auto ->> 'gender_confidence')::numeric, 0);
  v_fl := coalesce((v_auto ->> 'compare_front_left')::numeric, 0);
  v_fr := coalesce((v_auto ->> 'compare_front_right')::numeric, 0);
  v_face_conf := coalesce((v_auto ->> 'face_confidence')::numeric, 0);
  v_age_high := coalesce((v_auto ->> 'age_range_high')::int, 99);
  v_occ := coalesce((v_auto ->> 'face_occluded_confidence')::numeric, 0);
  v_final := lower(trim(coalesce(v_auto ->> 'final_gender', '')));

  IF v_final NOT IN ('male', 'female') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender');
  END IF;

  IF v_gender_conf < 86 OR v_face_conf < 80 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'below_thresholds',
      'gender_confidence', v_gender_conf,
      'face_confidence', v_face_conf,
      'compare_front_left', v_fl,
      'compare_front_right', v_fr
    );
  END IF;

  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage');
  END IF;

  IF v_occ > 88 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded');
  END IF;

  v_face_url := coalesce(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
  v_avatar_src := coalesce(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);
  v_vt := CASE WHEN v_final = 'female' THEN 'host' ELSE 'user' END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET gender = v_final,
      is_host = (v_final = 'female'),
      host_status = CASE WHEN v_final = 'female' THEN 'approved' ELSE NULL END,
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
          '[auto] service_auto_finalize_face_verification: Rekognition thresholds passed.'
        ELSE
          trim(admin_notes) || E'\n[auto] service_auto_finalize_face_verification: Rekognition thresholds passed.'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_final,
    'verification_type', v_vt,
    'avatar_set', v_avatar_src IS NOT NULL,
    'compare_front_left', v_fl,
    'compare_front_right', v_fr
  );
END;
$function$;