
-- Add registration_country_code to profiles (immutable once set)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS registration_country_code TEXT;

-- Backfill from existing country_code
UPDATE public.profiles 
SET registration_country_code = country_code 
WHERE registration_country_code IS NULL AND country_code IS NOT NULL;

-- Create trigger to auto-set registration_country_code on first profile creation/update
-- and PREVENT it from ever being changed
CREATE OR REPLACE FUNCTION public.lock_registration_country()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT: if registration_country_code not provided, copy from country_code
  IF TG_OP = 'INSERT' THEN
    IF NEW.registration_country_code IS NULL AND NEW.country_code IS NOT NULL THEN
      NEW.registration_country_code := NEW.country_code;
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE: once set, NEVER allow change
  IF TG_OP = 'UPDATE' THEN
    -- If already set, force it to stay the same (ignore any attempt to change)
    IF OLD.registration_country_code IS NOT NULL THEN
      NEW.registration_country_code := OLD.registration_country_code;
    ELSE
      -- First time setting: allow it, or auto-fill from country_code
      IF NEW.registration_country_code IS NULL AND NEW.country_code IS NOT NULL THEN
        NEW.registration_country_code := NEW.country_code;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists, then create
DROP TRIGGER IF EXISTS trg_lock_registration_country ON public.profiles;
CREATE TRIGGER trg_lock_registration_country
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_registration_country();
