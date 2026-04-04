-- FIX 1: process_face_verification_auto - missing is_verified = true
CREATE OR REPLACE FUNCTION public.process_face_verification_auto(
  _submission_id uuid,
  _detected_gender text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _profile_gender TEXT;
BEGIN
  SELECT user_id INTO _user_id FROM face_verification_submissions WHERE id = _submission_id;
  SELECT gender INTO _profile_gender FROM profiles WHERE id = _user_id;
  
  IF _detected_gender IS NULL THEN
    UPDATE face_verification_submissions SET status = 'pending' WHERE id = _submission_id;
    RETURN 'pending';
  END IF;
  
  IF LOWER(_profile_gender) = LOWER(_detected_gender) THEN
    UPDATE face_verification_submissions
    SET status = 'approved', reviewed_at = now()
    WHERE id = _submission_id;
    
    UPDATE profiles
    SET is_verified = true, is_face_verified = true, face_verified_at = now()
    WHERE id = _user_id;
    
    RETURN 'approved';
  ELSE
    UPDATE face_verification_submissions
    SET status = 'rejected',
        rejection_reason = 'জেন্ডার ম্যাচ হয়নি। প্রোফাইল জেন্ডার: ' || COALESCE(_profile_gender, 'অজানা') || ', ডিটেক্টেড: ' || _detected_gender,
        reviewed_at = now()
    WHERE id = _submission_id;
    
    RETURN 'rejected';
  END IF;
END;
$$;

-- FIX 2: admin_block_user - add is_face_verified = false when blocking
CREATE OR REPLACE FUNCTION public.admin_block_user(
  _user_id uuid,
  _block boolean,
  _reason text DEFAULT NULL
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
    
    IF _block THEN
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_at = now(),
            blocked_reason = _reason,
            is_host = false,
            user_level = 0,
            host_level = 0,
            is_online = false,
            is_verified = false,
            is_face_verified = false,
            face_verified_at = NULL,
            host_status = 'inactive',
            total_earnings = 0,
            pending_earnings = 0,
            last_seen_at = now()
        WHERE id = _user_id;
        
        UPDATE public.agency_hosts
        SET status = 'left', left_at = now()
        WHERE host_id = _user_id AND status = 'active';
    ELSE
        UPDATE public.profiles
        SET 
            is_blocked = false,
            blocked_at = NULL,
            blocked_reason = NULL
        WHERE id = _user_id;
    END IF;
    
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END,
        'user',
        _user_id,
        jsonb_build_object('reason', _reason)
    );
    
    RETURN TRUE;
END;
$$;

-- FIX 3: admin_remove_face_verification - also set is_verified = false
CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can remove face verification';
  END IF;

  UPDATE profiles
  SET is_verified = false, is_face_verified = false, face_verified_at = null
  WHERE id = _user_id;
  
  DELETE FROM face_verification_submissions WHERE user_id = _user_id;
  
  RETURN true;
END;
$$;