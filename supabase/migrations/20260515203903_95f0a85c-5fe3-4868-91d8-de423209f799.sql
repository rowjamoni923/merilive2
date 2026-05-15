
-- Pkg: Face Verification Hardening — auto gender swap + avatar auto-set
-- 1) service_auto_finalize_face_verification: ALSO write avatar_url from the verified front still
--    (this already swaps gender+is_host based on Rekognition — keep that intact).
-- 2) sync_profile_on_face_verification: ALSO write avatar_url from front still on approval,
--    and demote/promote is_host to match the LATEST profiles.gender (which the auto-finalizer
--    may have just corrected from the Rekognition result).

CREATE OR REPLACE FUNCTION public.service_auto_finalize_face_verification(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.face_verification_submissions%ROWTYPE;
  v_auto jsonb;
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
  WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'submission_not_found');
  END IF;

  IF lower(trim(coalesce(v_sub.status, ''))) IS DISTINCT FROM 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wrong_status', 'status', v_sub.status);
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

  IF v_gender_conf < 86 OR v_fl < 72 OR v_fr < 72 OR v_face_conf < 80 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds');
  END IF;

  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage');
  END IF;

  IF v_occ > 88 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded');
  END IF;

  v_face_url := coalesce(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
  -- Avatar should be the still front photo only (never the video).
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

  RETURN jsonb_build_object('success', true, 'gender', v_final, 'verification_type', v_vt, 'avatar_set', v_avatar_src IS NOT NULL);
END;
$function$;


CREATE OR REPLACE FUNCTION public.sync_profile_on_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _face_url text;
  _avatar_src text;
  _approve_as text;
  _profile_gender text;
  _is_female boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Still images for evidence; avatar must NEVER be a video URL.
  _face_url := COALESCE(NEW.front_url, NEW.selfie_url, NEW.profile_photo_url, NEW.face_image_url);
  _avatar_src := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url);
  _approve_as := COALESCE(NEW.verification_type, 'user');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF NEW.status = 'approved' THEN
    SELECT lower(trim(COALESCE(gender, ''))) INTO _profile_gender
    FROM public.profiles
    WHERE id = NEW.user_id;

    _is_female := (_approve_as = 'host' OR _profile_gender = 'female');

    UPDATE public.profiles
    SET is_verified = TRUE,
        is_face_verified = TRUE,
        face_verification_image = COALESCE(_face_url, face_verification_image),
        avatar_url = COALESCE(_avatar_src, avatar_url),
        face_verified_at = COALESCE(face_verified_at, now()),
        face_verification_status = 'approved',
        is_host = _is_female,
        host_status = CASE WHEN _is_female THEN 'approved' ELSE NULL END,
        updated_at = now()
    WHERE id = NEW.user_id;

  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.profiles
    SET is_face_verified = FALSE,
        face_verification_image = NULL,
        face_verified_at = NULL,
        face_verification_status = 'rejected',
        is_host = CASE WHEN lower(trim(COALESCE(gender, ''))) = 'female' THEN FALSE ELSE is_host END,
        host_status = CASE WHEN lower(trim(COALESCE(gender, ''))) = 'female' THEN 'rejected' ELSE host_status END,
        updated_at = now()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$function$;
