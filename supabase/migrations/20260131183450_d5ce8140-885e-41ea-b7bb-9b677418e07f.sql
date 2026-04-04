-- Add payment methods for Level 5 Helper (Bd Admin)
-- These will automatically show in Recharge page when helper has 300K+ diamonds and is online

INSERT INTO helper_country_payment_methods (
  helper_id,
  country_code,
  method_name,
  method_type,
  account_name,
  account_number,
  bank_name,
  instructions,
  is_active,
  display_order
) VALUES 
-- bKash for Bd Admin
(
  'ceee7318-14a6-46da-8644-43cb2d4b7244',
  'BD',
  'bKash',
  'mobile_wallet',
  'Bd Admin',
  '01XXXXXXXXX',
  NULL,
  'Send money to this bKash number. Make sure to save the Transaction ID.',
  true,
  1
),
-- Nagad for Bd Admin
(
  'ceee7318-14a6-46da-8644-43cb2d4b7244',
  'BD',
  'Nagad',
  'mobile_wallet',
  'Bd Admin',
  '01XXXXXXXXX',
  NULL,
  'Send money to this Nagad number. Save the Transaction ID for verification.',
  true,
  2
);