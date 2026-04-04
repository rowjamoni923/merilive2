-- Update helper payment methods with real phone numbers
UPDATE helper_payment_methods 
SET account_number = '01607777277'
WHERE helper_id = 'ceee7318-14a6-46da-8644-43cb2d4b7244'
  AND account_number = '01XXXXXXXXX';

-- Update account name to match helper panel
UPDATE helper_payment_methods 
SET account_name = 'Meri Live'
WHERE helper_id = 'ceee7318-14a6-46da-8644-43cb2d4b7244';