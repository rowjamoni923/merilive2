-- Force cleanup for the specific stuck call
UPDATE private_calls 
SET status = 'ended', ended_at = now()
WHERE id = '291ab1c4-7f1b-4b8e-bfa6-279295e6404e';

-- Reset is_in_call for the host
UPDATE profiles 
SET is_in_call = false 
WHERE id = '303f6684-e8c1-43e1-b090-fc30ba15bdd9';

-- Also reset any other users who might have stuck is_in_call flags
UPDATE profiles 
SET is_in_call = false 
WHERE is_in_call = true;