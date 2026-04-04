
-- Update the face verification processing function to support role selection
CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id UUID,
  _action TEXT,
  _reason TEXT DEFAULT NULL,
  _approve_as TEXT DEFAULT 'host'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _submission RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Get submission
  SELECT * INTO _submission
  FROM face_verification_submissions
  WHERE id = _submission_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _action = 'approve' THEN
    -- Update submission status
    UPDATE face_verification_submissions
    SET 
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    -- Update user profile based on approve_as selection
    IF _approve_as = 'host' THEN
      UPDATE profiles
      SET 
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = true,
        host_status = 'approved'
      WHERE id = _submission.user_id;
    ELSE
      -- Approve as verified user (not host)
      UPDATE profiles
      SET 
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = false,
        host_status = NULL
      WHERE id = _submission.user_id;
    END IF;
    
  ELSIF _action = 'reject' THEN
    -- Update submission status
    UPDATE face_verification_submissions
    SET 
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    -- Reject: make them a regular user
    UPDATE profiles
    SET 
      is_face_verified = false,
      face_verification_image = NULL,
      face_verified_at = NULL,
      is_host = false,
      host_status = 'rejected'
    WHERE id = _submission.user_id;
  END IF;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'process_face_verification',
    'face_verification',
    _submission_id,
    jsonb_build_object(
      'action', _action,
      'approve_as', _approve_as,
      'user_id', _submission.user_id,
      'reason', _reason
    )
  );
  
  RETURN TRUE;
END;
$$;
