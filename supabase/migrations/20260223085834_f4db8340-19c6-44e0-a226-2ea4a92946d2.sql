-- Fix wrong country data: Reset country_code to NULL for users whose region clearly belongs to non-BD countries
-- This allows the improved detection logic to re-detect the correct country on next login

UPDATE profiles 
SET country_code = NULL, country_name = NULL, country_flag = NULL 
WHERE country_code = 'BD' 
AND is_deleted = false 
AND region IS NOT NULL
AND region NOT LIKE '%Division%'
AND region NOT IN ('Dhaka', 'Chittagong', 'Rajshahi', 'Khulna', 'Sylhet', 'Rangpur', 'Barisal', 'Mymensingh');