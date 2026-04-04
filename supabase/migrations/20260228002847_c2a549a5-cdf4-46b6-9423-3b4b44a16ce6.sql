
-- Update face verification function to support gender setting on approval
DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _reason text DEFAULT NULL,
  _approve_as text DEFAULT 'user',
  _set_gender text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _submission RECORD;
  _gender_value text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT * INTO _submission
  FROM face_verification_submissions
  WHERE id = _submission_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Determine gender: use explicit _set_gender if provided, else default by role
  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  
  IF _action = 'approve' THEN
    UPDATE face_verification_submissions
    SET 
      status = 'approved',
      verification_type = _approve_as,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    IF _approve_as = 'host' THEN
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = true,
        host_status = 'approved',
        gender = _gender_value
      WHERE id = _submission.user_id;
    ELSE
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = false,
        host_status = NULL,
        gender = _gender_value
      WHERE id = _submission.user_id;
    END IF;
    
  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions
    SET 
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    UPDATE profiles
    SET 
      is_face_verified = false,
      face_verification_image = NULL,
      face_verified_at = NULL
    WHERE id = _submission.user_id;
  END IF;
  
  PERFORM public.log_admin_action(
    'process_face_verification',
    'face_verification',
    _submission_id,
    jsonb_build_object(
      'action', _action,
      'approve_as', _approve_as,
      'gender', _gender_value,
      'user_id', _submission.user_id,
      'verification_type', _submission.verification_type,
      'reason', _reason
    )
  );
  
  RETURN TRUE;
END;
$$;
