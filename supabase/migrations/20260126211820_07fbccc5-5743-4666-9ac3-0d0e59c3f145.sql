-- Fix integer out of range for transfers - only tables without trigger conflicts

-- Fix coin_transfers.amount (main error source)
ALTER TABLE public.coin_transfers 
ALTER COLUMN amount TYPE bigint;

-- Fix agencies.diamond_balance  
ALTER TABLE public.agencies
ALTER COLUMN diamond_balance TYPE bigint;

-- Fix agency_diamond_transactions columns
ALTER TABLE public.agency_diamond_transactions
ALTER COLUMN beans_amount TYPE bigint;

ALTER TABLE public.agency_diamond_transactions
ALTER COLUMN diamond_amount TYPE bigint;

ALTER TABLE public.agency_diamond_transactions
ALTER COLUMN fee_amount TYPE bigint;