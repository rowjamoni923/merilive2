CREATE OR REPLACE FUNCTION public.admin_change_own_password(
  p_admin_user_id UUID,
  p_new_password TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_admin_id UUID;
  v_token TEXT;
BEGIN
  -- Read the admin session token from request header
  v_token := current_setting('request.headers', true)::jsonb ->> 'x-admin-token';

  IF v_token IS NULL OR length(v_token) < 16 THEN
    RAISE EXCEPTION 'No active admin session';
  END IF;

  -- Resolve the active admin from the session token
  SELECT s.admin_user_id INTO v_session_admin_id
  FROM public.admin_sessions s
  WHERE s.session_token = v_token
    AND s.expires_at > now()
  LIMIT 1;

  IF v_session_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin session is invalid or expired';
  END IF;

  -- Admins can only change their own password through this RPC
  IF v_session_admin_id <> p_admin_user_id THEN
    RAISE EXCEPTION 'You can only change your own password';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  -- Update password (hashed via pgcrypto crypt() with bcrypt salt)
  UPDATE public.admin_users
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      password_set_at = now(),
      must_change_password = false,
      updated_at = now()
  WHERE id = p_admin_user_id;

  -- Bump session activity
  UPDATE public.admin_sessions
  SET last_active_at = now()
  WHERE session_token = v_token;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_own_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_own_password(UUID, TEXT) TO anon, authenticated;