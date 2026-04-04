-- Fix amount column type to accept decimal values like 1.99, 3.99 etc.
ALTER TABLE public.recharge_transactions 
ALTER COLUMN amount TYPE numeric USING amount::numeric;