-- Add logo_url column to helper_payment_methods table
-- This allows Level 5 helpers to upload their own payment method logos
ALTER TABLE public.helper_payment_methods 
ADD COLUMN IF NOT EXISTS logo_url TEXT;