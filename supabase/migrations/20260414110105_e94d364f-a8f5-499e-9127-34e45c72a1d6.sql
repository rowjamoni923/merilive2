
-- Fix level 9-15 thresholds that were incorrectly set to 0
UPDATE user_level_tiers SET min_consumption = 30000000 WHERE tier_type = 'host' AND level_number = 9 AND min_consumption = 0;
UPDATE user_level_tiers SET min_consumption = 50000000 WHERE tier_type = 'host' AND level_number = 10 AND min_consumption = 0;
UPDATE user_level_tiers SET min_consumption = 80000000 WHERE tier_type = 'host' AND level_number = 11 AND min_consumption = 0;
UPDATE user_level_tiers SET min_consumption = 120000000 WHERE tier_type = 'host' AND level_number = 12 AND min_consumption = 0;
UPDATE user_level_tiers SET min_consumption = 180000000 WHERE tier_type = 'host' AND level_number = 13 AND min_consumption = 0;
UPDATE user_level_tiers SET min_consumption = 250000000 WHERE tier_type = 'host' AND level_number = 14 AND min_consumption = 0;
UPDATE user_level_tiers SET min_consumption = 350000000 WHERE tier_type = 'host' AND level_number = 15 AND min_consumption = 0;

-- Reset all host levels to their correct value based on actual weekly_earnings
-- This recalculates by finding the correct tier for each host
UPDATE profiles p
SET host_level = COALESCE(
  (SELECT MAX(t.level_number)
   FROM user_level_tiers t
   WHERE t.tier_type = 'host'
     AND t.is_active = true
     AND t.min_consumption <= COALESCE(p.weekly_earnings, 0)),
  0
)
WHERE p.is_host = true AND p.host_level > 0;
