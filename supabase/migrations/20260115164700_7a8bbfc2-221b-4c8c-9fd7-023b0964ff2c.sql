-- Add payment details columns to payment_gateways table
ALTER TABLE public.payment_gateways
ADD COLUMN IF NOT EXISTS payment_number TEXT,
ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.payment_gateways.payment_number IS 'The phone/account number for manual payment methods like bKash, Nagad';
COMMENT ON COLUMN public.payment_gateways.payment_instructions IS 'Instructions for users on how to make payment';