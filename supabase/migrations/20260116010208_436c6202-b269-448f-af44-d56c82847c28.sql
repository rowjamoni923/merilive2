-- Allow Level 5 Helpers with payroll_enabled to view agency withdrawals for their assigned countries
CREATE POLICY "Level 5 helpers can view agency withdrawals for assigned countries"
ON public.agency_withdrawals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.topup_helpers th
    JOIN public.helper_assigned_countries hac ON hac.helper_id = th.id
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND hac.country_code = agency_withdrawals.country_code
      AND hac.is_active = true
  )
);

-- Allow Level 5 Helpers to update agency withdrawals (process them)
CREATE POLICY "Level 5 helpers can process agency withdrawals for assigned countries"
ON public.agency_withdrawals
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 
    FROM public.topup_helpers th
    JOIN public.helper_assigned_countries hac ON hac.helper_id = th.id
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND hac.country_code = agency_withdrawals.country_code
      AND hac.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.topup_helpers th
    JOIN public.helper_assigned_countries hac ON hac.helper_id = th.id
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND hac.country_code = agency_withdrawals.country_code
      AND hac.is_active = true
  )
);

-- Also allow admins full access to agency_withdrawals
CREATE POLICY "Admins can manage all agency withdrawals"
ON public.agency_withdrawals
FOR ALL
USING (public.is_admin(auth.uid()));

-- Allow users to see country payment methods from helpers (for payment in recharge page)
CREATE POLICY "Users can view active helper country payment methods"
ON public.helper_country_payment_methods
FOR SELECT
USING (is_active = true);