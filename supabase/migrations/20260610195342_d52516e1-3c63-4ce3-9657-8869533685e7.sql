
-- Sub-wave 3A: views security_invoker + OTP exchange lockdown + diag policy tightening

-- 1. Convert 4 views to security_invoker so they enforce the CALLER's RLS
ALTER VIEW public.agencies_public         SET (security_invoker = on);
ALTER VIEW public.auto_action_log         SET (security_invoker = on);
ALTER VIEW public.pk_agency_leaderboard   SET (security_invoker = on);
ALTER VIEW public.profiles_public         SET (security_invoker = on);

-- 2. otp_exchange_tokens: server-only, but currently has anon/auth full grants. Revoke.
REVOKE ALL ON public.otp_exchange_tokens FROM anon;
REVOKE ALL ON public.otp_exchange_tokens FROM authenticated;
-- service_role retains full access (bypasses RLS anyway)

-- 3. Tighten private_call_diag insert policy: an authenticated user may only
--    insert diagnostic rows for their own auth_uid (or NULL).
DROP POLICY IF EXISTS diag_system_insert ON public.private_call_diag;
CREATE POLICY diag_system_insert
  ON public.private_call_diag
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_uid IS NULL OR auth_uid = auth.uid());
