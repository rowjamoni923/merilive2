
-- 1. Delete ALL fraudulent gift_transactions from the banned hacker
DELETE FROM public.gift_transactions 
WHERE sender_id = 'b6f665cd-7811-4989-851a-c4d821ac736f';

-- 2. Reset sumaiya's inflated earnings to 0 (she only had 1 legit 100-coin gift)
UPDATE public.profiles 
SET total_earnings = 0, 
    pending_earnings = 0,
    beans = 0
WHERE id = 'e4b8eff0-314b-44f0-a063-1400addff921';

-- 3. Also clean any gift_transaction_logs from the hacker
DELETE FROM public.gift_transaction_logs 
WHERE sender_id = 'b6f665cd-7811-4989-851a-c4d821ac736f';
