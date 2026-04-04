
-- Fix Rouf Agency user's country to Pakistan (IP shows Islamabad, Pakistan)
UPDATE profiles 
SET country_code = 'PK', 
    country_flag = '🇵🇰'
WHERE id = '57c6cc41-c33c-4421-a4c8-c9ba8e90719b';
