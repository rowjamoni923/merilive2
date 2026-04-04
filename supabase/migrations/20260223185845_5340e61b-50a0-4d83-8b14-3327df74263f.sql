-- Clear country data for the 3 test agency owners
UPDATE profiles 
SET country_code = NULL, country_name = NULL, country_flag = NULL 
WHERE id = 'ab155d31-96d4-4a42-855d-b2c090ba0339';