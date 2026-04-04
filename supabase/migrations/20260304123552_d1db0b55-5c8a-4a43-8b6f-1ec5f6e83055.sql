
-- Add merchant_number and is_merchant to helper_country_payment_methods
ALTER TABLE public.helper_country_payment_methods
  ADD COLUMN IF NOT EXISTS merchant_number TEXT,
  ADD COLUMN IF NOT EXISTS is_merchant BOOLEAN DEFAULT false;

-- Add merchant_number and is_merchant to helper_payment_methods
ALTER TABLE public.helper_payment_methods
  ADD COLUMN IF NOT EXISTS merchant_number TEXT,
  ADD COLUMN IF NOT EXISTS is_merchant BOOLEAN DEFAULT false;
