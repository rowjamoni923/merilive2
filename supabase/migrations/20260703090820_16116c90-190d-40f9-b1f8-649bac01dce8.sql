CREATE OR REPLACE FUNCTION public.country_flag_from_code(_code text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  c text := upper(nullif(btrim(_code), ''));
  first_code int;
  second_code int;
BEGIN
  IF c IS NULL OR c !~ '^[A-Z]{2}$' THEN
    RETURN NULL;
  END IF;
  first_code := 127397 + ascii(substr(c, 1, 1));
  second_code := 127397 + ascii(substr(c, 2, 1));
  RETURN chr(first_code) || chr(second_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.country_name_from_code(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(nullif(btrim(_code), ''))
    WHEN 'AF' THEN 'Afghanistan' WHEN 'AL' THEN 'Albania' WHEN 'DZ' THEN 'Algeria' WHEN 'AD' THEN 'Andorra'
    WHEN 'AO' THEN 'Angola' WHEN 'AR' THEN 'Argentina' WHEN 'AM' THEN 'Armenia' WHEN 'AU' THEN 'Australia'
    WHEN 'AT' THEN 'Austria' WHEN 'AZ' THEN 'Azerbaijan' WHEN 'BH' THEN 'Bahrain' WHEN 'BD' THEN 'Bangladesh'
    WHEN 'BE' THEN 'Belgium' WHEN 'BR' THEN 'Brazil' WHEN 'CA' THEN 'Canada' WHEN 'CN' THEN 'China'
    WHEN 'CO' THEN 'Colombia' WHEN 'DK' THEN 'Denmark' WHEN 'EG' THEN 'Egypt' WHEN 'ET' THEN 'Ethiopia'
    WHEN 'FR' THEN 'France' WHEN 'DE' THEN 'Germany' WHEN 'GH' THEN 'Ghana' WHEN 'GB' THEN 'United Kingdom'
    WHEN 'IN' THEN 'India' WHEN 'ID' THEN 'Indonesia' WHEN 'IT' THEN 'Italy' WHEN 'JP' THEN 'Japan'
    WHEN 'JO' THEN 'Jordan' WHEN 'KE' THEN 'Kenya' WHEN 'KR' THEN 'South Korea' WHEN 'MY' THEN 'Malaysia'
    WHEN 'NP' THEN 'Nepal' WHEN 'NG' THEN 'Nigeria' WHEN 'PK' THEN 'Pakistan' WHEN 'PH' THEN 'Philippines'
    WHEN 'QA' THEN 'Qatar' WHEN 'RO' THEN 'Romania' WHEN 'RU' THEN 'Russia' WHEN 'SA' THEN 'Saudi Arabia'
    WHEN 'SG' THEN 'Singapore' WHEN 'TH' THEN 'Thailand' WHEN 'TR' THEN 'Turkey' WHEN 'AE' THEN 'United Arab Emirates'
    WHEN 'US' THEN 'United States' WHEN 'VN' THEN 'Vietnam' WHEN 'ZA' THEN 'South Africa'
    ELSE upper(nullif(btrim(_code), ''))
  END
$$;

CREATE OR REPLACE FUNCTION public.infer_country_from_city_region(_city text, _region text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(_city,''))) IN ('samsun','istanbul','ankara','izmir','mahmutbey','tekirdağ') OR lower(btrim(coalesce(_region,''))) IN ('samsun','istanbul','ankara') THEN 'TR'
    WHEN lower(btrim(coalesce(_city,''))) IN ('manila','quezon city','cebu','davao','makati') OR lower(btrim(coalesce(_region,''))) IN ('calabarzon','national capital region','metro manila','western visayas','central visayas','davao region','central luzon','eastern visayas') THEN 'PH'
    WHEN lower(btrim(coalesce(_city,''))) IN ('lagos','abuja','ibadan','kano') OR lower(btrim(coalesce(_region,''))) IN ('lagos','ogun','rivers') THEN 'NG'
    WHEN lower(btrim(coalesce(_city,''))) IN ('accra','kumasi','tamale') OR lower(btrim(coalesce(_region,''))) IN ('greater accra','ashanti') THEN 'GH'
    WHEN lower(btrim(coalesce(_city,''))) IN ('nairobi','mombasa') THEN 'KE'
    WHEN lower(btrim(coalesce(_city,''))) IN ('rome','milan','naples') OR lower(btrim(coalesce(_region,''))) IN ('lazio','lombardy') THEN 'IT'
    WHEN lower(btrim(coalesce(_city,''))) IN ('tokyo','osaka','kyoto') THEN 'JP'
    WHEN lower(btrim(coalesce(_city,''))) IN ('london','manchester','birmingham') OR lower(btrim(coalesce(_region,''))) IN ('england','scotland') THEN 'GB'
    WHEN lower(btrim(coalesce(_city,''))) IN ('new delhi','mumbai','kolkata','bengaluru','chennai') OR lower(btrim(coalesce(_region,''))) IN ('west bengal','tamil nadu','karnataka','maharashtra','uttar pradesh','rajasthan','kerala','telangana') THEN 'IN'
    WHEN lower(btrim(coalesce(_city,''))) IN ('karachi','lahore','islamabad','rawalpindi') OR lower(btrim(coalesce(_region,''))) IN ('sindh','punjab','punjab (pakistan)','khyber pakhtunkhwa','balochistan','islamabad capital territory') THEN 'PK'
    WHEN lower(btrim(coalesce(_city,''))) IN ('kathmandu','pokhara') THEN 'NP'
    WHEN lower(btrim(coalesce(_city,''))) IN ('jakarta','surabaya','bandung','yogyakarta') OR lower(btrim(coalesce(_region,''))) IN ('west java','east java','central java','bali','jakarta') THEN 'ID'
    WHEN lower(btrim(coalesce(_city,''))) IN ('dubai','abu dhabi','sharjah') THEN 'AE'
    WHEN lower(btrim(coalesce(_city,''))) IN ('riyadh','jeddah','mecca','dammam') THEN 'SA'
    WHEN lower(btrim(coalesce(_city,''))) IN ('são paulo','sao paulo','rio de janeiro') THEN 'BR'
    WHEN lower(btrim(coalesce(_city,''))) IN ('paris','marseille','lyon') OR lower(btrim(coalesce(_region,''))) IN ('île-de-france','ile-de-france') THEN 'FR'
    WHEN lower(btrim(coalesce(_city,''))) IN ('frankfurt am main','berlin','munich','nuremberg') THEN 'DE'
    WHEN lower(btrim(coalesce(_city,''))) IN ('bucharest') THEN 'RO'
    WHEN lower(btrim(coalesce(_city,''))) IN ('amman') THEN 'JO'
    WHEN lower(btrim(coalesce(_city,''))) IN ('cairo') THEN 'EG'
    WHEN lower(btrim(coalesce(_city,''))) IN ('addis ababa') THEN 'ET'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.tg_lock_profile_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true';
  v_role text := current_setting('request.jwt.claim.role', true);
  v_old_code text := upper(nullif(btrim(OLD.country_code), ''));
  v_new_code text := upper(nullif(btrim(NEW.country_code), ''));
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    IF NEW.country_code IS NOT NULL THEN NEW.country_code := upper(nullif(btrim(NEW.country_code), '')); END IF;
    IF NEW.country_code IS NULL THEN
      NEW.country_name := NULL;
      NEW.country_flag := NULL;
    ELSE
      NEW.country_name := COALESCE(nullif(btrim(NEW.country_name), ''), public.country_name_from_code(NEW.country_code));
      NEW.country_flag := COALESCE(nullif(btrim(NEW.country_flag), ''), public.country_flag_from_code(NEW.country_code));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.country_code IS NOT NULL THEN NEW.country_code := upper(nullif(btrim(NEW.country_code), '')); END IF;
  v_new_code := upper(nullif(btrim(NEW.country_code), ''));

  IF v_old_code IS NOT NULL AND v_new_code IS DISTINCT FROM v_old_code AND NOT (v_bypass OR v_role = 'service_role' OR public.is_active_admin_session()) THEN
    NEW.country_code := OLD.country_code;
    NEW.country_name := OLD.country_name;
    NEW.country_flag := OLD.country_flag;
    RETURN NEW;
  END IF;

  IF v_new_code IS NULL THEN
    NEW.country_name := NULL;
    NEW.country_flag := NULL;
  ELSE
    NEW.country_name := COALESCE(nullif(btrim(NEW.country_name), ''), public.country_name_from_code(v_new_code));
    NEW.country_flag := COALESCE(nullif(btrim(NEW.country_flag), ''), public.country_flag_from_code(v_new_code));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_lock_profile_country ON public.profiles;
CREATE TRIGGER tg_lock_profile_country
BEFORE INSERT OR UPDATE OF country_code, country_name, country_flag ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_lock_profile_country();

ALTER TABLE public.profiles ALTER COLUMN country_code DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN country_flag DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN country_name DROP DEFAULT;

WITH inferred AS (
  SELECT id, public.infer_country_from_city_region(city, region) AS code
  FROM public.profiles
  WHERE upper(coalesce(country_code, '')) = 'BD'
), fixed AS (
  UPDATE public.profiles p
  SET country_code = i.code,
      country_name = public.country_name_from_code(i.code),
      country_flag = public.country_flag_from_code(i.code),
      updated_at = now()
  FROM inferred i
  WHERE p.id = i.id
    AND i.code IS NOT NULL
    AND i.code <> 'BD'
  RETURNING p.id
)
SELECT count(*) FROM fixed;

CREATE OR REPLACE FUNCTION public.get_public_host_countries_v1()
 RETURNS TABLE(country_code text, country_flag text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT upper(p.country_code), p.country_flag
  FROM public.profiles p
  WHERE COALESCE(p.is_host, false) = true
    AND lower(COALESCE(p.gender, '')) = 'female'
    AND p.host_status = 'approved'
    AND COALESCE(p.is_face_verified, false) = true
    AND COALESCE(p.is_blocked, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_deleted, false) = false
    AND upper(coalesce(p.country_code, '')) ~ '^[A-Z]{2}$'
    AND p.country_flag IS NOT NULL
    AND p.country_flag <> 'NONE';
$function$;