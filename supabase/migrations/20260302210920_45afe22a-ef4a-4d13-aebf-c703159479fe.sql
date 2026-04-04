-- Auto finalize face verification with secure server-side role conversion
-- This function is intended to be called ONLY from server-side (service_role), e.g. Edge Functions.
CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(
  _submission_id uuid,
  _detected_gender text,
  _admin_notes text DEFAULT NULL,
  _avatar_url text DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _host_photos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission public.face_verification_submissions%ROWTYPE;
  v_gender text;
  v_is_host boolean;
  v_verification_type text;
BEGIN
  -- Critical safety: only service_role can execute this privileged function.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_submission
  FROM public.face_verification_submissions
  WHERE id = _submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  v_gender := CASE
    WHEN lower(coalesce(_detected_gender, 'male')) = 'female' THEN 'female'
    ELSE 'male'
  END;

  v_is_host := (v_gender = 'female');
  v_verification_type := CASE WHEN v_is_host THEN 'host' ELSE 'face' END;

  -- Bypass protected profile-column trigger in this transaction only.
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.face_verification_submissions
  SET
    status = 'approved',
    verification_type = v_verification_type,
    rejection_reason = NULL,
    admin_notes = COALESCE(_admin_notes, admin_notes),
    reviewed_at = now(),
    face_verified_at = now(),
    updated_at = now()
  WHERE id = _submission_id;

  UPDATE public.profiles
  SET
    is_verified = true,
    is_face_verified = true,
    face_verification_image = v_submission.face_image_url,
    face_verified_at = now(),
    gender = v_gender,
    is_host = v_is_host,
    host_status = CASE WHEN v_is_host THEN 'approved' ELSE NULL END,
    avatar_url = COALESCE(_avatar_url, avatar_url),
    display_name = COALESCE(NULLIF(trim(_display_name), ''), display_name),
    host_photos = CASE
      WHEN v_is_host AND _host_photos IS NOT NULL AND coalesce(array_length(_host_photos, 1), 0) > 0 THEN _host_photos
      ELSE host_photos
    END,
    updated_at = now()
  WHERE id = v_submission.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', _submission_id,
    'user_id', v_submission.user_id,
    'gender', v_gender,
    'is_host', v_is_host,
    'verification_type', v_verification_type
  );
END;
$$;