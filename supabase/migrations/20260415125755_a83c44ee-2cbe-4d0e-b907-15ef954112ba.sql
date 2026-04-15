DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _approve_as text DEFAULT 'user',
  _reason text DEFAULT NULL,
  _set_gender text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _submission RECORD;
  _gender_value text;
  _face_url text;
  _caller_id uuid;
BEGIN
  _caller_id := auth.uid();
  IF NOT public.is_admin(_caller_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  SELECT * INTO _submission FROM face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  
  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  _face_url := COALESCE(_submission.face_image_url, _submission.selfie_url);
  
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  IF _action = 'approve' THEN
    UPDATE face_verification_submissions 
    SET status = 'approved', verification_type = _approve_as, reviewed_by = _caller_id::text, 
        reviewed_at = now(), admin_notes = _reason, updated_at = now() 
    WHERE id = _submission_id;
    
    IF _approve_as = 'host' THEN
      UPDATE profiles SET is_verified = true, is_face_verified = true, 
        face_verification_image = _face_url, face_verified_at = now(), 
        is_host = true, host_status = 'approved', gender = _gender_value 
      WHERE id = _submission.user_id;
    ELSE
      UPDATE profiles SET is_verified = true, is_face_verified = true, 
        face_verification_image = _face_url, face_verified_at = now(), 
        gender = _gender_value 
      WHERE id = _submission.user_id;
    END IF;
    
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (
      _submission.user_id, '✅ Face Verification Approved!',
      'Congratulations! Your face verification has been approved as ' || 
        CASE WHEN _approve_as = 'host' THEN 'Host' ELSE 'Verified User' END || '.',
      'face_verification_approved',
      jsonb_build_object('submission_id', _submission_id, 'approved_as', _approve_as, 'gender', _gender_value)
    );
    
  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions 
    SET status = 'rejected', reviewed_by = _caller_id::text, reviewed_at = now(), 
        rejection_reason = _reason, updated_at = now() 
    WHERE id = _submission_id;
    
    UPDATE profiles SET is_face_verified = false, face_verification_image = NULL, face_verified_at = NULL 
    WHERE id = _submission.user_id;
    
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (
      _submission.user_id, '❌ Face Verification Rejected',
      COALESCE('Reason: ' || _reason, 'Please try again with a clear photo.'),
      'face_verification_rejected',
      jsonb_build_object('submission_id', _submission_id, 'rejection_reason', COALESCE(_reason, ''))
    );
  END IF;
  
  PERFORM public.log_admin_action('process_face_verification', 'face_verification', _submission_id::text,
    jsonb_build_object('action', _action, 'approve_as', _approve_as, 'gender', _gender_value, 'user_id', _submission.user_id, 'reason', _reason));
  
  RETURN TRUE;
END;
$$;