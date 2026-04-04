-- Sync total_earnings from gift_transactions for hosts who received gifts
-- and recalculate their host_level based on earnings

-- Step 1: Update total_earnings for hosts based on received gifts
WITH gift_totals AS (
  SELECT 
    gt.receiver_id,
    SUM(FLOOR(gt.coin_amount * 0.6)) as total_received  -- 60% of gift value goes to host
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.receiver_id
  WHERE p.is_host = true
  GROUP BY gt.receiver_id
)
UPDATE profiles p
SET total_earnings = COALESCE(gt.total_received, 0)
FROM gift_totals gt
WHERE p.id = gt.receiver_id
AND p.is_host = true;

-- Step 2: Recalculate host_level for all hosts based on their total_earnings
UPDATE profiles p
SET host_level = COALESCE(
  (SELECT level_number 
   FROM user_level_tiers 
   WHERE tier_type = 'host' 
   AND is_active = true 
   AND min_earning_amount <= COALESCE(p.total_earnings, 0)
   ORDER BY level_number DESC 
   LIMIT 1), 0)
WHERE p.is_host = true;