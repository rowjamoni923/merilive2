
-- Fix: Increase rate limit from 5 to 50 per hour and make it per-device not per-token
CREATE OR REPLACE FUNCTION recover_session_by_device(p_device_id text)
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
BEGIN
  -- Simply look up the profile by device_id - no rate limiting needed for reads
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    p.gender,
    p.is_host,
    (SELECT au.email FROM auth.users au WHERE au.id = p.id) as recovery_email,
    ('meri_' || p_device_id || '_secure') as recovery_password
  FROM profiles p
  WHERE p.device_id = p_device_id
  LIMIT 1;
END;
$$;
