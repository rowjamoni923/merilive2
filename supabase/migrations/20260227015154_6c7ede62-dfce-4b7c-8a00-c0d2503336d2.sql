-- Fix the Filipino user's country that was incorrectly detected
UPDATE profiles 
SET country_code = 'PH'
WHERE id = '94d058af-ad2c-48ea-8d79-9e90578cbcb7' 
AND country_code = 'BD';
-- The sync_country_fields trigger will auto-set country_name and country_flag