
-- Add payment methods for Level 5 helper (Bd Admin) 
-- This helper has 3.4 million diamonds balance
INSERT INTO helper_payment_methods (
  helper_id,
  country_code,
  payment_type,
  account_name,
  account_number,
  bank_name,
  is_active,
  is_default
) VALUES 
(
  'ceee7318-14a6-46da-8644-43cb2d4b7244',
  'BD',
  'bKash',
  'Bd Admin',
  '01XXXXXXXXX',
  NULL,
  true,
  true
),
(
  'ceee7318-14a6-46da-8644-43cb2d4b7244',
  'BD',
  'Nagad',
  'Bd Admin',
  '01XXXXXXXXX',
  NULL,
  true,
  false
);
