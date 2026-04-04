-- Create a function to recover session by device ID
-- This allows users to restore their accounts after reinstalling the app

CREATE OR REPLACE FUNCTION public.recover_session_by_device(
  p_device_id TEXT
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  gender TEXT,
  is_host BOOLEAN,
  recovery_email TEXT,
  recovery_password TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_email TEXT;
  v_password TEXT;
BEGIN
  -- Find the profile with this device ID
  SELECT p.id, p.display_name, p.avatar_url, p.gender, p.is_host
  INTO v_profile
  FROM profiles p
  WHERE p.device_id = p_device_id
  AND p.is_deleted IS NOT TRUE
  LIMIT 1;
  
  IF v_profile IS NULL THEN
    -- No account found for this device
    RETURN;
  END IF;
  
  -- Generate deterministic credentials based on device ID
  -- These are the same credentials that would have been used during registration
  v_email := 'guest_' || p_device_id || '@meri.local';
  v_password := 'meri_' || p_device_id || '_secure';
  
  RETURN QUERY SELECT 
    v_profile.id,
    v_profile.display_name,
    v_profile.avatar_url,
    v_profile.gender,
    v_profile.is_host,
    v_email,
    v_password;
END;
$$;

-- Grant execute permission to anonymous users (for app reinstall scenario)
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(TEXT) TO authenticated;