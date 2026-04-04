-- Fix the agency_level_tiers with correct income ranges
UPDATE agency_level_tiers SET 
  min_weekly_income = 0, 
  max_weekly_income = 499999,
  updated_at = now()
WHERE level_code = 'A1';

UPDATE agency_level_tiers SET 
  min_weekly_income = 500000, 
  max_weekly_income = 999999,
  updated_at = now()
WHERE level_code = 'A2';

UPDATE agency_level_tiers SET 
  min_weekly_income = 1000000, 
  max_weekly_income = 24999999,
  updated_at = now()
WHERE level_code = 'A3';

UPDATE agency_level_tiers SET 
  min_weekly_income = 25000000, 
  max_weekly_income = 499999999,
  updated_at = now()
WHERE level_code = 'A4';

UPDATE agency_level_tiers SET 
  min_weekly_income = 500000000, 
  max_weekly_income = 9999999999,
  updated_at = now()
WHERE level_code = 'A5';