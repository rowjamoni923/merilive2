-- Pkg339: Tighten is_admin_session(_admin_id) so it verifies CALLER identity via x-admin-token header.
-- Before: returned true for ANY valid active admin id, even when caller was anon. 17 admin_* RPCs
-- trusted client-supplied _admin_id → anon RCE on streams / recordings / agency policy / party
-- backgrounds / helper application approval / user report status / 8 admin_list_* leaks.
-- After: caller must hold a valid admin session (header) AND either be the same admin or an owner.

CREATE OR REPLACE FUNCTION public.is_admin_session(_admin_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
BEGIN
  -- Service role bypass (cron / edge-functions using service key)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = _admin_id AND is_active = true
    );
  END IF;

  v_caller_id := public.current_admin_id_from_header();
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- Caller acting as themselves
  IF v_caller_id = _admin_id THEN
    RETURN true;
  END IF;

  -- Owners may act on behalf of any active admin
  SELECT role::text INTO v_caller_role
  FROM public.admin_users
  WHERE id = v_caller_id AND is_active = true
  LIMIT 1;

  IF v_caller_role = 'owner' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = _admin_id AND is_active = true
    );
  END IF;

  RETURN false;
END;
$function$;

-- Fix admin_authenticate doc-string drift: function actually issues a 7-day session,
-- not 24h as the inline comment claimed. Body is unchanged.
COMMENT ON FUNCTION public.admin_authenticate(text, text) IS
  'Pkg339: bcrypt-verifies email/password, issues 7-day admin_sessions row + 32-byte hex session_token. Caller must follow up with admin_request_device_access for non-owners before the session is usable on RLS-protected tables.';