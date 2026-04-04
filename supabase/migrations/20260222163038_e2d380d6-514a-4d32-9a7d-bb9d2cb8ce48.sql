-- Fix incorrect country for Filipino user (IP 119.93.8.4 is PLDT Philippines)
UPDATE profiles
SET 
  country_code = 'PH',
  country_name = 'Philippines',
  country_flag = '🇵🇭'
WHERE id = '57e30978-8521-469f-a633-0dc0f11e9a05'
  AND registration_ip = '119.93.8.4';
