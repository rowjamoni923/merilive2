-- Fix veva's country from BD to ET (Ethiopia) - IP 196.190.154.237 is Ethio Telecom, Addis Ababa
UPDATE profiles 
SET country_code = 'ET', country_name = 'Ethiopia', country_flag = '🇪🇹', updated_at = now()
WHERE id = '6e264d8b-c7d0-4896-ab06-904328f2fe2a';