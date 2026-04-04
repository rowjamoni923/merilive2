
-- Fix existing withdrawals in 'processing' status with incorrect diamond_reward
-- Diamond reward should equal net_withdrawal_beans (1 bean = 1 diamond)
UPDATE agency_withdrawals 
SET diamond_reward = COALESCE((payment_details->>'net_withdrawal_beans')::NUMERIC, amount)
WHERE status = 'processing' 
  AND diamond_reward IS NOT NULL 
  AND diamond_reward < 100000;  -- Only fix the incorrectly calculated ones (USD*100 gives small values)
