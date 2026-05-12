CREATE OR REPLACE VIEW public.topup_helpers_public
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  trader_level,
  is_active,
  is_verified,
  payroll_enabled
FROM public.topup_helpers
WHERE is_active = true AND is_verified = true;

GRANT SELECT ON public.topup_helpers_public TO authenticated, anon;

DROP POLICY IF EXISTS "public read active verified traders" ON public.topup_helpers;
CREATE POLICY "public read active verified traders"
ON public.topup_helpers
FOR SELECT
TO authenticated, anon
USING (is_active = true AND is_verified = true);