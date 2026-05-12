-- 1. Country + logo on legacy helper_payment_methods
ALTER TABLE public.helper_payment_methods
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- 2. Backfill country_code from topup_helpers (helper's own country)
UPDATE public.helper_payment_methods hpm
SET country_code = th.country_code
FROM public.topup_helpers th
WHERE hpm.helper_id = th.id
  AND hpm.country_code IS NULL
  AND th.country_code IS NOT NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_helper_payment_methods_country
  ON public.helper_payment_methods(country_code) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_payment_gateways_country
  ON public.payment_gateways USING gin(country_codes);

-- 4. Trigger: auto-fill country_code on insert if missing (use helper's country)
CREATE OR REPLACE FUNCTION public.helper_payment_methods_autofill_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country_code IS NULL OR NEW.country_code = '' THEN
    SELECT country_code INTO NEW.country_code
    FROM public.topup_helpers
    WHERE id = NEW.helper_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_helper_payment_methods_autofill_country ON public.helper_payment_methods;
CREATE TRIGGER trg_helper_payment_methods_autofill_country
  BEFORE INSERT ON public.helper_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.helper_payment_methods_autofill_country();