-- Set a special "NONE" marker for test accounts so the geolocation hook 
-- sees a non-null country_code and skips detection, but UI shows nothing
UPDATE profiles 
SET country_code = 'NONE', country_name = NULL, country_flag = NULL, city = NULL, region = NULL
WHERE id IN (
  'ab155d31-96d4-4a42-855d-b2c090ba0339',
  '6888e618-ae45-4bbb-bbd2-6834fc0f9ff9',
  '7acd387f-77e5-425e-badb-afae78869123'
);