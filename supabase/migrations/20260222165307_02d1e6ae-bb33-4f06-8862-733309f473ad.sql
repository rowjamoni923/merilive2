-- Fix eshuu user: Islamabad is in Pakistan, not Bangladesh
UPDATE profiles SET country_code = 'PK', country_name = 'Pakistan', country_flag = '🇵🇰'
WHERE id = '1ea45a4a-42db-43b0-956d-2032d4444a8d';

-- Also fix any remaining users with Islamabad city wrongly assigned to BD
UPDATE profiles SET country_code = 'PK', country_name = 'Pakistan', country_flag = '🇵🇰'
WHERE country_code = 'BD' AND city = 'Islamabad';