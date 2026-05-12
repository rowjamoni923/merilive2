-- Batch 4: Country filter + logos for Level 1-4 helper top-up methods
ALTER TABLE public.topup_payment_methods
  ADD COLUMN IF NOT EXISTS country_codes text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Backfill logo_url from existing icon_url where missing
UPDATE public.topup_payment_methods
SET logo_url = icon_url
WHERE logo_url IS NULL AND icon_url IS NOT NULL;

-- GIN index for country filtering
CREATE INDEX IF NOT EXISTS idx_topup_payment_methods_country_codes
  ON public.topup_payment_methods USING GIN (country_codes);
