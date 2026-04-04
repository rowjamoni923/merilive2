-- Drop existing policies if they exist and recreate
DO $$ 
BEGIN
  -- Drop if exists
  DROP POLICY IF EXISTS "Level 5 helpers can view all pending withdrawals" ON agency_withdrawals;
  DROP POLICY IF EXISTS "Level 5 helpers can update withdrawals they claim" ON agency_withdrawals;
END $$;

-- Create RLS policy for Level 5 Payroll Helpers to view ALL pending/processing withdrawals
CREATE POLICY "Level 5 helpers can view all pending withdrawals"
ON agency_withdrawals 
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM topup_helpers 
    WHERE user_id = auth.uid() 
    AND trader_level = 5 
    AND payroll_enabled = true 
    AND is_active = true
  )
  AND status IN ('pending', 'processing')
);

-- Create policy for Level 5 helpers to update withdrawals (claim/process)
CREATE POLICY "Level 5 helpers can update withdrawals they claim"
ON agency_withdrawals 
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM topup_helpers 
    WHERE user_id = auth.uid() 
    AND trader_level = 5 
    AND payroll_enabled = true 
    AND is_active = true
  )
)
WITH CHECK (
  status IN ('pending', 'processing')
  AND (
    assigned_helper_id IS NULL 
    OR assigned_helper_id IN (SELECT id FROM topup_helpers WHERE user_id = auth.uid())
  )
);