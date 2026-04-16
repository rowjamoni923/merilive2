DROP POLICY IF EXISTS "Level 5 helpers can view agency withdrawals" ON public.agency_withdrawals;

CREATE POLICY "Level 5 helpers can view agency withdrawals"
ON public.agency_withdrawals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
      AND (
        (
          agency_withdrawals.status = 'pending'
          AND th.country_code = COALESCE(agency_withdrawals.country_code, agency_withdrawals.payment_details->>'country_code')
        )
        OR (
          agency_withdrawals.status = 'processing'
          AND agency_withdrawals.assigned_helper_id = th.id
        )
      )
  )
);