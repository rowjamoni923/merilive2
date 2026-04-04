-- Fix integer out of range error for gift_transactions
-- Change coin_amount from integer to bigint to support large gift values

ALTER TABLE public.gift_transactions 
ALTER COLUMN coin_amount TYPE bigint;