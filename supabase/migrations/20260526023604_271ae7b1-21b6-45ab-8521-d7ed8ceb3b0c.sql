-- Pkg360: Disable user/admin login lockout cooldowns per product policy.
-- The app uses single-device displacement for session control; failed-attempt
-- cooldowns must not block the newest device or owner secret-link login.

DELETE FROM public.account_lockouts;

CREATE OR REPLACE FUNCTION public.check_brute_force(
  p_identifier text,
  p_action_type text DEFAULT NULL::text,
  p_ip_address text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Product policy: never time-lock app/admin login attempts.
  -- Keep the RPC shape for existing frontend/admin_authenticate callers.
  RETURN jsonb_build_object(
    'allowed', true,
    'locked', false,
    'failed_attempts', 0,
    'attempts_remaining', 999
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_brute_force(p_identifier text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.check_brute_force(p_identifier, NULL::text, NULL::text)
$function$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_identifier text,
  p_success boolean,
  p_ip_address text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Keep lightweight audit rows for diagnostics, but never create/extend lockouts.
  INSERT INTO public.login_attempts (identifier, success, ip_address, user_agent)
  VALUES (left(coalesce(p_identifier, ''), 254), coalesce(p_success, false), p_ip_address, p_user_agent);

  IF p_success THEN
    DELETE FROM public.account_lockouts
    WHERE identifier = left(coalesce(p_identifier, ''), 254);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_brute_force(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_brute_force(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean, text, text) TO anon, authenticated;