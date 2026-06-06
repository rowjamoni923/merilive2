CREATE OR REPLACE FUNCTION public.process_face_verification_v3(
    p_user_id uuid, 
    p_is_match boolean, 
    p_confidence numeric, 
    p_face_rekognition_id text, 
    p_profile_photo_url text, 
    p_live_face_url text DEFAULT NULL::text, 
    p_duplicate_user_id uuid DEFAULT NULL::uuid,
    p_gender_detected text DEFAULT NULL::text,
    p_gender_confidence numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _submission_id uuid;
  _result jsonb;
  _dup_is_guard_host boolean;
  _dup_display_name text;
  _auto_ok boolean;
  _user_gender text;
BEGIN
  -- Fetch user's registered gender
  SELECT gender INTO _user_gender FROM public.profiles WHERE id = p_user_id;

  -- Gender Mismatch Check (Professional)
  IF _user_gender = 'female' AND p_gender_detected = 'Male' AND p_gender_confidence > 85 THEN
    RETURN jsonb_build_object(
      'isMatch', false, 
      'confidence', p_confidence,
      'error_code', 'GENDER_MISMATCH',
      'error', 'Gender mismatch detected. You are registered as female, but a male face was detected. Professional accounts must match the registered gender.'
    );
  END IF;

  -- Duplicate Detection
  IF p_duplicate_user_id IS NOT NULL AND p_duplicate_user_id <> p_user_id THEN
    SELECT display_name INTO _dup_display_name FROM public.profiles WHERE id = p_duplicate_user_id;
    
    SELECT EXISTS (
      SELECT 1 FROM public.profiles d
      WHERE d.id = p_duplicate_user_id AND d.is_host = true
        AND lower(coalesce(d.host_status::text, '')) = 'approved'
        AND coalesce(d.is_face_verified, false) = true
    ) INTO _dup_is_guard_host;

    IF _dup_is_guard_host THEN
      PERFORM public.ban_duplicate_face_user(p_user_id, p_duplicate_user_id, p_confidence, p_face_rekognition_id);
      RETURN jsonb_build_object(
        'isMatch', false, 
        'confidence', p_confidence,
        'error_code', 'DUPLICATE_FACE', 
        'duplicate_of', p_duplicate_user_id, 
        'duplicate_name', _dup_display_name,
        'banned', true,
        'error', 'Multiple accounts detected. This face is already verified under the account: "' || coalesce(_dup_display_name, 'Another User') || '".'
      );
    END IF;
  END IF;

  -- Auto-approve gate (Pkg381: was 90, now 75)
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
    
    _result := jsonb_build_object(
      'isMatch', true, 
      'confidence', p_confidence,
      'submission_id', _submission_id, 
      'status', 'approved',
      'face_rekognition_id', p_face_rekognition_id
    );
  ELSE
    _result := jsonb_build_object(
      'isMatch', false, 
      'confidence', p_confidence,
      'submission_id', _submission_id, 
      'status', 'rejected',
      'error_code', CASE WHEN p_confidence < 75 THEN 'LOW_CONFIDENCE' ELSE 'NO_MATCH' END,
      'error', CASE WHEN p_confidence < 75
                    THEN 'Live face did not closely match the profile photo. Please retake your selfie in good lighting and try again.'
                    ELSE 'Face match failed. Please retake your selfie and ensure you match your profile picture.' END
    );
  END IF;

  RETURN _result;
END;
$function$;
