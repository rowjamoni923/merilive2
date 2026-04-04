-- Fix existing users who have coins but no total_consumption
-- This updates users who received manual topups before this fix
UPDATE profiles 
SET 
  total_consumption = COALESCE(coins, 0),
  user_level = CASE
    WHEN COALESCE(coins, 0) >= 30000000000 THEN 50
    WHEN COALESCE(coins, 0) >= 10000000000 THEN 40
    WHEN COALESCE(coins, 0) >= 3000000000 THEN 30
    WHEN COALESCE(coins, 0) >= 1000000000 THEN 20
    WHEN COALESCE(coins, 0) >= 300000000 THEN 10
    WHEN COALESCE(coins, 0) >= 100000000 THEN 9
    WHEN COALESCE(coins, 0) >= 30000000 THEN 8
    WHEN COALESCE(coins, 0) >= 10000000 THEN 7
    WHEN COALESCE(coins, 0) >= 3000000 THEN 6
    WHEN COALESCE(coins, 0) >= 1000000 THEN 5
    WHEN COALESCE(coins, 0) >= 300000 THEN 4
    WHEN COALESCE(coins, 0) >= 100000 THEN 3
    WHEN COALESCE(coins, 0) >= 30000 THEN 2
    WHEN COALESCE(coins, 0) >= 10000 THEN 1
    ELSE 0
  END
WHERE 
  COALESCE(coins, 0) > 0 
  AND COALESCE(total_consumption, 0) = 0
  AND (is_host = false OR is_host IS NULL OR gender IS DISTINCT FROM 'female');

-- Fix existing female hosts who have earnings but no level
UPDATE profiles 
SET 
  user_level = CASE
    WHEN COALESCE(total_earnings, 0) >= 150000000 THEN 10
    WHEN COALESCE(total_earnings, 0) >= 50000000 THEN 9
    WHEN COALESCE(total_earnings, 0) >= 15000000 THEN 8
    WHEN COALESCE(total_earnings, 0) >= 5000000 THEN 7
    WHEN COALESCE(total_earnings, 0) >= 1500000 THEN 6
    WHEN COALESCE(total_earnings, 0) >= 500000 THEN 5
    WHEN COALESCE(total_earnings, 0) >= 150000 THEN 4
    WHEN COALESCE(total_earnings, 0) >= 50000 THEN 3
    WHEN COALESCE(total_earnings, 0) >= 15000 THEN 2
    WHEN COALESCE(total_earnings, 0) >= 5000 THEN 1
    ELSE 0
  END
WHERE 
  is_host = true 
  AND gender = 'female'
  AND COALESCE(total_earnings, 0) > 0;