-- Lock user country to registration country forever (VPN-proof)
-- Once country_code/country_name/country_flag is set on a profile,
-- it cannot be changed by anyone except admins (is_admin(auth.uid())).

CREATE OR REPLACE FUNCTION public.lock_profile_country_once_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_user boolean := false;
BEGIN
  -- Allow admins (manual correction in admin panel)
  BEGIN
    is_admin_user := COALESCE(public.is_admin(auth.uid()), false);
  EXCEPTION WHEN OTHERS THEN
    is_admin_user := false;
  END;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- country_code: once set (non-null, non-empty, not 'NONE'), freeze forever
  IF OLD.country_code IS NOT NULL AND OLD.country_code <> '' THEN
    IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
      NEW.country_code := OLD.country_code;
    END IF;
    -- Keep name/flag tied to locked code
    IF NEW.country_name IS DISTINCT FROM OLD.country_name AND OLD.country_name IS NOT NULL THEN
      NEW.country_name := OLD.country_name;
    END IF;
    IF NEW.country_flag IS DISTINCT FROM OLD.country_flag AND OLD.country_flag IS NOT NULL THEN
      NEW.country_flag := OLD.country_flag;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_profile_country ON public.profiles;
CREATE TRIGGER trg_lock_profile_country
BEFORE UPDATE OF country_code, country_name, country_flag ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.lock_profile_country_once_set();