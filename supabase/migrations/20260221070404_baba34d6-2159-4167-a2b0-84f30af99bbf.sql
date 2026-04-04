-- Fix all user levels: use coins + total_consumption (total topup) as the metric
-- Also ensure minimum level is 1, never 0

-- Regular users (non-female-hosts): use coins + total_consumption
UPDATE profiles p
SET user_level = GREATEST(
  COALESCE(
    (SELECT level_number 
     FROM user_level_tiers 
     WHERE tier_type = 'user' 
       AND is_active = true 
       AND min_topup_amount <= (COALESCE(p.coins, 0) + COALESCE(p.total_consumption, 0))
     ORDER BY level_number DESC 
     LIMIT 1),
    1
  ),
  1
),
updated_at = now()
WHERE NOT (p.is_host = true AND p.gender = 'female');

-- Female hosts: use total_earnings, minimum level 1
UPDATE profiles p
SET user_level = GREATEST(
  COALESCE(
    (SELECT level_number 
     FROM user_level_tiers 
     WHERE tier_type = 'host' 
       AND is_active = true 
       AND min_earning_amount <= COALESCE(p.total_earnings, 0)
     ORDER BY level_number DESC 
     LIMIT 1),
    1
  ),
  1
),
updated_at = now()
WHERE p.is_host = true AND p.gender = 'female';