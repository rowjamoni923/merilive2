-- Fix Nightingale's country from BD to PH (IP 110.54.198.250 is Philippines)
UPDATE profiles SET country_code = 'PH' WHERE id = '71118822-e9b0-4405-9040-5ffdc93383ec';
