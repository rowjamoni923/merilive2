-- Fix: Set user_id for sazzadshifa776@gmail.com in admin_users
UPDATE admin_users 
SET user_id = 'b1a1469b-15e3-4068-90f9-5d53dd66c8cf'
WHERE email = 'sazzadshifa776@gmail.com' AND user_id IS NULL;