
-- Create validate_session_integrity function
-- This function validates user sessions by checking device fingerprint consistency
CREATE OR REPLACE FUNCTION public.validate_session_integrity(
  p_user_id UUID,
  p_device_fingerprint TEXT,
  p_ip_address TEXT DEFAULT 'unknown',
  p_user_agent TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_profile RECORD;
  v_known_device BOOLEAN := false;
BEGIN
  -- Get user profile
  SELECT id, device_id, is_banned
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  -- If no profile found, allow (new user)
  IF v_profile IS NULL THEN
    v_result := json_build_object(
      'valid', true,
      'action', 'allow',
      'reason', 'new_user'
    );
    RETURN v_result;
  END IF;

  -- If user is banned, force logout
  IF v_profile.is_banned = true THEN
    v_result := json_build_object(
      'valid', false,
      'action', 'force_logout',
      'reason', 'user_banned'
    );
    RETURN v_result;
  END IF;

  -- Check if device fingerprint matches known device
  IF v_profile.device_id IS NOT NULL AND v_profile.device_id = p_device_fingerprint THEN
    v_known_device := true;
  END IF;

  -- Update last seen
  UPDATE profiles
  SET last_seen = now()
  WHERE id = p_user_id;

  -- Default: allow the session
  v_result := json_build_object(
    'valid', true,
    'action', 'allow',
    'known_device', v_known_device,
    'reason', 'session_valid'
  );

  RETURN v_result;
END;
$$;
