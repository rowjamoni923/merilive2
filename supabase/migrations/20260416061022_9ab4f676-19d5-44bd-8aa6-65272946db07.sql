-- Add missing country_code column that the trigger references
ALTER TABLE public.agency_withdrawals
ADD COLUMN IF NOT EXISTS country_code text;
