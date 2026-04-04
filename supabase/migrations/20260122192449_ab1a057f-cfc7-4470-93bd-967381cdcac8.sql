-- Reset weekly_earnings and host_level to 0 for test host
UPDATE profiles 
SET weekly_earnings = 0, host_level = 0 
WHERE app_uid = '1401318700';