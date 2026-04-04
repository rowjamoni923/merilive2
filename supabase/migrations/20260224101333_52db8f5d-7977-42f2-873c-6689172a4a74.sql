
CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  gender text,
  is_host boolean,
  recovery_email text,
  recovery_password text
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
  -- Rate limit: max 5 recovery attempts per device per hour
  IF (SELECT count(*) FROM recovery_tokens WHERE device_id = p_device_id AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many recovery attempts. Please try again later.';
  END IF;

  -- Find the profile with this device ID
  SELECT p.id, p.display_name, p.avatar_url, p.gender, p.is_host
  INTO v_profile
  FROM profiles p
  WHERE p.device_id = p_device_id
  AND p.is_deleted IS NOT TRUE
  LIMIT 1;
  
  IF v_profile IS NULL THEN
    RETURN;
  END IF;
  
  -- Use DETERMINISTIC credentials that match what was used during registration
  -- This is the same formula used in Auth.tsx: handleDeviceRegistration()
  v_email := 'guest_' || p_device_id || '@meri.local';
  v_password := 'meri_' || p_device_id || '_secure';
  
  -- Log recovery attempt
  INSERT INTO recovery_tokens (user_id, device_id, token)
  VALUES (v_profile.id, p_device_id, encode(gen_random_bytes(16), 'hex'));
  
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
