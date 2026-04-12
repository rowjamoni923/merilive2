
ALTER TABLE public.helper_country_payment_methods
  ADD COLUMN IF NOT EXISTS helper_id uuid,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS method_name text,
  ADD COLUMN IF NOT EXISTS method_type text DEFAULT 'mobile_banking',
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS additional_info jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS logo_url text;

CREATE INDEX IF NOT EXISTS idx_hcpm_helper_id ON public.helper_country_payment_methods(helper_id);
CREATE INDEX IF NOT EXISTS idx_hcpm_country_active ON public.helper_country_payment_methods(country_code, is_active);
