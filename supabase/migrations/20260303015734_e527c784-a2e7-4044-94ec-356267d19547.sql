-- Add missing columns to gift_transactions table
ALTER TABLE public.gift_transactions 
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS call_id text DEFAULT NULL;