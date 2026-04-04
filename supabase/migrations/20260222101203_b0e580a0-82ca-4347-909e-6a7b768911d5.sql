-- Reset ALL users' country_code so geolocation re-detects on next login
-- The fixed useGeolocation code will properly detect their real country
UPDATE profiles 
SET 
  country_code = NULL,
  country_name = NULL,
  country_flag = NULL
WHERE country_code IS NOT NULL;