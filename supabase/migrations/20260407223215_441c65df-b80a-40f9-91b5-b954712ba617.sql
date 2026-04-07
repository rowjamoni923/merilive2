-- Create recover_session_by_device RPC
-- This function is called BEFORE login to check if a device already has an account
-- Returns deterministic guest credentials for automatic login

CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id TEXT)
RETURNS TABLE(
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
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_url,
    p.gender,
    COALESCE(p.is_host, false) AS is_host,
    ('guest_' || p_device_id || '@meri.local')::TEXT AS recovery_email,
    ('meri_' || p_device_id || '_secure')::TEXT AS recovery_password
  FROM profiles p
  WHERE p.device_id = p_device_id
  LIMIT 1;
END;
$$;

-- Grant execute to anon (called before login) and authenticated
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(TEXT) TO authenticated;