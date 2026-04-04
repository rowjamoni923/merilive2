-- Add logo_url column to helper_country_payment_methods table
ALTER TABLE public.helper_country_payment_methods 
ADD COLUMN IF NOT EXISTS logo_url text;

-- Add comment for clarity
COMMENT ON COLUMN public.helper_country_payment_methods.logo_url IS 'URL of the custom logo uploaded by helper for this payment method';