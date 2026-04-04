-- Add ID verification columns to helper_applications for Level 5 Payroll Helpers
ALTER TABLE public.helper_applications 
ADD COLUMN IF NOT EXISTS id_card_front_url TEXT,
ADD COLUMN IF NOT EXISTS id_card_back_url TEXT,
ADD COLUMN IF NOT EXISTS id_card_name TEXT,
ADD COLUMN IF NOT EXISTS id_card_number TEXT,
ADD COLUMN IF NOT EXISTS full_address TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;