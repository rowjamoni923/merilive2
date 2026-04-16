
-- Drop the broken UPDATE policy
DROP POLICY IF EXISTS "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals;

-- Create fixed UPDATE policy for Level 5 helpers
CREATE POLICY "Level 5 helpers can update agency withdrawals" 
ON public.agency_withdrawals 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers th
    WHERE th.user_id = auth.uid() 
    AND th.trader_level = 5 
    AND th.payroll_enabled = true 
    AND th.is_active = true
  )
  AND (
    status = 'pending' 
    OR assigned_helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid())
  )
);
