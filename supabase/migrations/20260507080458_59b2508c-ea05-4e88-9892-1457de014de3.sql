GRANT SELECT, INSERT, UPDATE, DELETE ON public.helper_country_payment_methods TO authenticated;

DROP POLICY IF EXISTS "Helpers can view their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can insert their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can update their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can delete their own payment methods" ON public.helper_country_payment_methods;

CREATE POLICY "Helpers can view their own payment methods"
ON public.helper_country_payment_methods
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
  )
);

CREATE POLICY "Helpers can insert their own payment methods"
ON public.helper_country_payment_methods
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND COALESCE(th.is_active, true) = true
  )
);

CREATE POLICY "Helpers can update their own payment methods"
ON public.helper_country_payment_methods
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
  )
);

CREATE POLICY "Helpers can delete their own payment methods"
ON public.helper_country_payment_methods
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
  )
);