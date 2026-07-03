CREATE OR REPLACE FUNCTION public.tg_lock_profile_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true';
  v_role_legacy text := current_setting('request.jwt.claim.role', true);
  v_claims_raw text := current_setting('request.jwt.claims', true);
  v_role_new text := NULL;
  v_is_service boolean := false;
  v_old_code text := CASE WHEN TG_OP = 'UPDATE' THEN upper(nullif(btrim(OLD.country_code), '')) ELSE NULL END;
  v_new_code text := upper(nullif(btrim(NEW.country_code), ''));
BEGIN
  IF v_claims_raw IS NOT NULL AND v_claims_raw <> '' THEN
    BEGIN
      v_role_new := (v_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      v_role_new := NULL;
    END;
  END IF;

  v_is_service := v_role_legacy = 'service_role'
               OR v_role_new = 'service_role'
               OR session_user = 'service_role'
               OR current_user = 'service_role'
               OR auth.uid() IS NULL;

  NEW.country_code := v_new_code;

  IF TG_OP = 'UPDATE' AND v_old_code IS NOT NULL AND v_new_code IS DISTINCT FROM v_old_code AND NOT (v_bypass OR v_is_service OR public.is_active_admin_session()) THEN
    NEW.country_code := OLD.country_code;
    NEW.country_name := OLD.country_name;
    NEW.country_flag := OLD.country_flag;
    RETURN NEW;
  END IF;

  IF NEW.country_code IS NULL THEN
    NEW.country_name := NULL;
    NEW.country_flag := NULL;
  ELSE
    NEW.country_name := COALESCE(nullif(btrim(NEW.country_name), ''), public.country_name_from_code(NEW.country_code));
    NEW.country_flag := COALESCE(nullif(btrim(NEW.country_flag), ''), public.country_flag_from_code(NEW.country_code));
  END IF;

  RETURN NEW;
END;
$$;

WITH inferred AS (
  SELECT id, public.infer_country_from_city_region(city, region) AS code
  FROM public.profiles
  WHERE upper(coalesce(country_code, '')) = 'BD'
)
UPDATE public.profiles p
SET country_code = i.code,
    country_name = public.country_name_from_code(i.code),
    country_flag = public.country_flag_from_code(i.code),
    updated_at = now()
FROM inferred i
WHERE p.id = i.id
  AND i.code IS NOT NULL
  AND i.code <> 'BD';