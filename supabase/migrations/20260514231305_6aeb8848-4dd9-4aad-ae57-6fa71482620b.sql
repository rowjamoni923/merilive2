
-- Public-recharge read: allow any signed-in user to see active helper payment
-- accounts (account_number is intended to be publicly displayed for recharge),
-- but only when the linked helper is active + verified + payroll Level 5.

DROP POLICY IF EXISTS "Public can view active payroll helper country methods" ON public.helper_country_payment_methods;
CREATE POLICY "Public can view active payroll helper country methods"
  ON public.helper_country_payment_methods
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.topup_helpers th
      WHERE th.id = helper_country_payment_methods.helper_id
        AND th.is_active = true
        AND th.is_verified = true
        AND th.payroll_enabled = true
        AND th.trader_level = 5
    )
  );

DROP POLICY IF EXISTS "Public can view active payroll helper payment methods" ON public.helper_payment_methods;
CREATE POLICY "Public can view active payroll helper payment methods"
  ON public.helper_payment_methods
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.topup_helpers th
      WHERE th.id = helper_payment_methods.helper_id
        AND th.is_active = true
        AND th.is_verified = true
        AND th.payroll_enabled = true
        AND th.trader_level = 5
    )
  );
