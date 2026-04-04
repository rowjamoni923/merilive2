-- Rename the 3 payroll test agencies to "Official Agency"
UPDATE agencies SET name = 'Official Agency' WHERE id IN (
  '67b2036f-469c-44c7-8007-1c61ab9c3a81',
  'c5c39a7f-a540-4710-b2fb-21e8c62a7a9f',
  '8437a3df-0805-42a3-b8bb-7e02bc1933f8'
);

-- Remove country/district info from the 3 test owner profiles
UPDATE profiles SET country_code = NULL, country_name = NULL, country_flag = NULL WHERE id IN (
  'ab155d31-96d4-4a42-855d-b2c090ba0339',
  '6888e618-ae45-4bbb-bbd2-6834fc0f9ff9',
  '7acd387f-77e5-425e-badb-afae78869123'
);