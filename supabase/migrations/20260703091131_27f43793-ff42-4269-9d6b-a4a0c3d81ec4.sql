ALTER TABLE public.profiles DISABLE TRIGGER tg_lock_profile_country;

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

ALTER TABLE public.profiles ENABLE TRIGGER tg_lock_profile_country;