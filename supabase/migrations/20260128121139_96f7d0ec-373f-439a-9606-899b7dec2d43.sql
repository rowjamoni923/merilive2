-- Add payment screenshot and transaction ID columns to helper_applications
ALTER TABLE public.helper_applications
ADD COLUMN IF NOT EXISTS payment_screenshot_url TEXT,
ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.helper_applications.payment_screenshot_url IS 'URL of the payment screenshot uploaded by the applicant';
COMMENT ON COLUMN public.helper_applications.payment_transaction_id IS 'Transaction ID provided by the applicant for payment verification';