CREATE OR REPLACE FUNCTION public.current_admin_id_from_header()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_session record;
BEGIN
  v_token := public.current_admin_token_from_header();
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    au.id AS admin_id,
    au.role,
    s.device_fingerprint
  INTO v_session
  FROM public.admin_sessions s
  JOIN public.admin_users au ON au.id = s.admin_user_id
  WHERE s.session_token = v_token
    AND s.expires_at > now()
    AND au.is_active = true
  LIMIT 1;

  IF v_session.admin_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Owners intentionally skip manual device approval. A valid server-issued
  -- owner session token is enough for data-loading RPCs; this prevents the
  -- entire admin panel from showing zero data when device binding is missing
  -- or still being auto-created after secret-link login.
  IF v_session.role = 'owner' THEN
    RETURN v_session.admin_id;
  END IF;

  -- Sub-admins remain strict: the session must be bound to an approved device.
  IF v_session.device_fingerprint IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_allowed_devices d
    WHERE d.admin_user_id = v_session.admin_id
      AND d.device_fingerprint = v_session.device_fingerprint
      AND d.status = 'approved'
  ) THEN
    RETURN v_session.admin_id;
  END IF;

  RETURN NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.current_admin_id_from_header() TO anon;
GRANT EXECUTE ON FUNCTION public.current_admin_id_from_header() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_admin_id_from_header() TO service_role;