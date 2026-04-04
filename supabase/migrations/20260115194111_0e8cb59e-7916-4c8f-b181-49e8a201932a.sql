-- Update user level tiers to more reasonable thresholds
UPDATE user_level_tiers 
SET min_topup_amount = CASE level_number
  WHEN 0 THEN 0
  WHEN 1 THEN 1000
  WHEN 2 THEN 5000
  WHEN 3 THEN 15000
  WHEN 4 THEN 50000
  WHEN 5 THEN 150000
  WHEN 6 THEN 500000
  WHEN 7 THEN 1500000
  WHEN 8 THEN 5000000
  ELSE min_topup_amount
END
WHERE tier_type = 'user';

-- Recalculate levels for all users
DO $$
DECLARE
  _user_record record;
BEGIN
  FOR _user_record IN SELECT id FROM profiles WHERE is_host = false OR is_host IS NULL LOOP
    PERFORM recalculate_single_user_level(_user_record.id);
  END LOOP;
END;
$$;

-- Verify updated tiers
SELECT level_number, level_name, min_topup_amount FROM user_level_tiers 
WHERE tier_type = 'user' ORDER BY level_number;