-- Link user_id to admin_users for smtv923@gmail.com
UPDATE public.admin_users 
SET user_id = 'ab155d31-96d4-4a42-855d-b2c090ba0339'::uuid
WHERE email = 'smtv923@gmail.com';