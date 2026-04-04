-- Drop both overloaded versions and recreate them properly

-- Drop the 4-argument version first (more specific)
DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text, text);
-- Drop the 3-argument version
DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text);

-- Recreate: single unified function with _approve_as parameter
CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _reason text DEFAULT NULL,
  _approve_as text DEFAULT 'user'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      verification_type = _approve_as,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    -- Update user profile based on approve_as
    IF _approve_as = 'host' THEN
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = true,
        host_status = 'approved'
      WHERE id = _submission.user_id;
    ELSE
      -- Approve as user: set verified flags but DON'T touch host status
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now()
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
    
    -- Only remove face verification, don't change host status
    UPDATE profiles
    SET 
      is_face_verified = false,
      face_verification_image = NULL,
      face_verified_at = NULL
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
      'verification_type', _submission.verification_type,
      'reason', _reason
    )
  );
  
  RETURN TRUE;
END;
$$;