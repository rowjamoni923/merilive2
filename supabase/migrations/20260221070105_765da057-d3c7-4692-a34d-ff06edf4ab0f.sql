-- Fix all existing user levels based on total_consumption (not coins)
-- Regular users (non-female-hosts): use total_consumption
UPDATE profiles p
SET user_level = COALESCE(
  (SELECT level_number 
   FROM user_level_tiers 
   WHERE tier_type = 'user' 
     AND is_active = true 
     AND min_topup_amount <= COALESCE(p.total_consumption, 0)
   ORDER BY level_number DESC 
   LIMIT 1),
  0
),
updated_at = now()
WHERE NOT (p.is_host = true AND p.gender = 'female');

-- Female hosts: use total_earnings
UPDATE profiles p
SET user_level = COALESCE(
  (SELECT level_number 
   FROM user_level_tiers 
   WHERE tier_type = 'host' 
     AND is_active = true 
     AND min_earning_amount <= COALESCE(p.total_earnings, 0)
   ORDER BY level_number DESC 
   LIMIT 1),
  0
),
updated_at = now()
WHERE p.is_host = true AND p.gender = 'female';