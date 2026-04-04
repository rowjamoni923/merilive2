-- Create function to remove face verification (for admin)
CREATE OR REPLACE FUNCTION admin_remove_face_verification(
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update profile to remove verification
  UPDATE profiles
  SET 
    is_face_verified = false,
    face_verified_at = null
  WHERE id = _user_id;
  
  -- Delete face verification submissions for this user
  DELETE FROM face_verification_submissions
  WHERE user_id = _user_id;
  
  RETURN true;
END;
$$;

-- Create function to auto-approve or send to pending based on conditions
CREATE OR REPLACE FUNCTION process_face_verification_auto(
  _submission_id UUID,
  _detected_gender TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _profile_gender TEXT;
  _result TEXT;
BEGIN
  -- Get submission user_id
  SELECT user_id INTO _user_id
  FROM face_verification_submissions
  WHERE id = _submission_id;
  
  -- Get profile gender
  SELECT gender INTO _profile_gender
  FROM profiles
  WHERE id = _user_id;
  
  -- If no detected gender provided, send to pending for manual review
  IF _detected_gender IS NULL THEN
    UPDATE face_verification_submissions
    SET status = 'pending'
    WHERE id = _submission_id;
    
    RETURN 'pending';
  END IF;
  
  -- Check gender match
  IF LOWER(_profile_gender) = LOWER(_detected_gender) THEN
    -- Gender matches - auto approve
    UPDATE face_verification_submissions
    SET 
      status = 'approved',
      reviewed_at = now()
    WHERE id = _submission_id;
    
    -- Update profile
    UPDATE profiles
    SET 
      is_face_verified = true,
      face_verified_at = now()
    WHERE id = _user_id;
    
    RETURN 'approved';
  ELSE
    -- Gender mismatch - reject immediately
    UPDATE face_verification_submissions
    SET 
      status = 'rejected',
      rejection_reason = 'জেন্ডার ম্যাচ হয়নি। প্রোফাইল জেন্ডার: ' || COALESCE(_profile_gender, 'অজানা') || ', ডিটেক্টেড: ' || _detected_gender,
      reviewed_at = now()
    WHERE id = _submission_id;
    
    RETURN 'rejected';
  END IF;
END;
$$;