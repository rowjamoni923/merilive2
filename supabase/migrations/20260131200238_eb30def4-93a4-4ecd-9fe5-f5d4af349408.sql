-- Drop the auto-assign trigger to enable manual first-come-first-serve claiming
-- Helpers should manually claim withdrawals, not get auto-assigned

DROP TRIGGER IF EXISTS trg_auto_assign_withdrawal_helper ON agency_withdrawals;

-- Keep the function for reference but it won't be triggered anymore
-- Can be deleted later if not needed

COMMENT ON FUNCTION auto_assign_withdrawal_helper IS 'DISABLED - Auto-assignment removed. Helpers now manually claim withdrawals (first-come-first-serve).';