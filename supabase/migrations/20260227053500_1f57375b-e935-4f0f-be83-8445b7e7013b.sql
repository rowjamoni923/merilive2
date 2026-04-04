-- Fix: When approving as 'user', explicitly set is_host=false to properly convert role
-- Also add function for admin to change gender and verification status post-approval

DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text, text);

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
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT * INTO _submission
  FROM face_verification_submissions
  WHERE id = _submission_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
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
        host_status = 'approved'
      WHERE id = _submission.user_id;
    ELSE
      -- Approve as USER: set verified flags AND explicitly revert host status
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = false,
        host_status = NULL
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
      'user_id', _submission.user_id,
      'verification_type', _submission.verification_type,
      'reason', _reason
    )
  );
  
  RETURN TRUE;
END;
$$;

-- Function: Admin can change user's gender post-approval
CREATE OR REPLACE FUNCTION public.admin_update_user_gender(
  _user_id uuid,
  _new_gender text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _new_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value';
  END IF;
  
  UPDATE profiles
  SET gender = _new_gender, updated_at = now()
  WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    'update_gender',
    'profile',
    _user_id,
    jsonb_build_object('new_gender', _new_gender)
  );
  
  RETURN TRUE;
END;
$$;

-- Function: Admin can toggle face verification status
CREATE OR REPLACE FUNCTION public.admin_toggle_face_verification(
  _user_id uuid,
  _verified boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  UPDATE profiles
  SET 
    is_face_verified = _verified,
    is_verified = _verified,
    face_verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
    face_verification_image = CASE WHEN _verified THEN face_verification_image ELSE NULL END,
    updated_at = now()
  WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    CASE WHEN _verified THEN 'enable_face_verification' ELSE 'disable_face_verification' END,
    'profile',
    _user_id,
    jsonb_build_object('verified', _verified)
  );
  
  RETURN TRUE;
END;
$$;

-- Function: Admin can change user's role (host/user) post-approval
CREATE OR REPLACE FUNCTION public.admin_change_user_role(
  _user_id uuid,
  _new_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _new_role NOT IN ('host', 'user') THEN
    RAISE EXCEPTION 'Invalid role value';
  END IF;
  
  IF _new_role = 'host' THEN
    UPDATE profiles
    SET is_host = true, host_status = 'approved', updated_at = now()
    WHERE id = _user_id;
  ELSE
    UPDATE profiles
    SET is_host = false, host_status = NULL, updated_at = now()
    WHERE id = _user_id;
  END IF;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    'change_user_role',
    'profile',
    _user_id,
    jsonb_build_object('new_role', _new_role)
  );
  
  RETURN TRUE;
END;
$$;