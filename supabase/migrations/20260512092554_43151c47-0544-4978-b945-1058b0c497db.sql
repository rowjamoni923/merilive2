-- Create missing admin_get_my_admin_user RPC used by SupportReportDialog
CREATE OR REPLACE FUNCTION public.admin_get_my_admin_user()
RETURNS TABLE(id uuid, email text, display_name text, role text, support_display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Resolve current admin from active admin session header
  SELECT s.admin_id INTO v_admin_id
  FROM public.admin_sessions s
  WHERE s.session_token = current_setting('request.headers', true)::jsonb->>'x-admin-token'
    AND s.expires_at > now()
    AND s.is_active = true
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.email, u.display_name, u.role::text, u.support_display_name
  FROM public.admin_users u
  WHERE u.id = v_admin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_my_admin_user() TO anon, authenticated;