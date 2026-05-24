CREATE OR REPLACE FUNCTION public.guard_profile_call_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
  _settings jsonb;
  _min_rate numeric;
  _max_rate numeric;
  _min_level_custom int;
  _level_rates jsonb;
  _is_level_rate boolean := false;
  _user_level int;
BEGIN
  IF NEW.call_rate_per_minute IS NOT DISTINCT FROM OLD.call_rate_per_minute THEN
    RETURN NEW;
  END IF;

  IF _bypass THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()))
     OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_host, false) IS NOT TRUE
     OR NEW.gender IS DISTINCT FROM 'female'
     OR NEW.host_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Only approved hosts can set call_rate_per_minute';
  END IF;

  SELECT setting_value INTO _settings
  FROM public.app_settings
  WHERE setting_key = 'call_rates'
  LIMIT 1;

  _min_rate := COALESCE((_settings->>'min_rate')::numeric, 30);
  _max_rate := COALESCE((_settings->>'max_rate')::numeric, 100000);
  _min_level_custom := COALESCE((_settings->>'min_level_for_custom_rate')::int, 0);
  _level_rates := COALESCE(_settings->'level_rates', '[]'::jsonb);

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_level_rates) lr
    WHERE (lr->>'rate')::numeric = NEW.call_rate_per_minute
  ) INTO _is_level_rate;

  IF NOT _is_level_rate THEN
    IF NEW.call_rate_per_minute IS NULL
       OR NEW.call_rate_per_minute < _min_rate
       OR NEW.call_rate_per_minute > _max_rate THEN
      RAISE EXCEPTION 'call_rate_per_minute % is out of allowed range [%, %]',
        NEW.call_rate_per_minute, _min_rate, _max_rate;
    END IF;

    _user_level := COALESCE(NEW.host_level, NEW.user_level, 0);
    IF _user_level < _min_level_custom THEN
      RAISE EXCEPTION 'Custom call rate requires host_level >= % (current: %)',
        _min_level_custom, _user_level;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_profile_call_rate ON public.profiles;
CREATE TRIGGER tg_guard_profile_call_rate
  BEFORE UPDATE OF call_rate_per_minute ON public.profiles
  FOR EACH ROW
  WHEN (OLD.call_rate_per_minute IS DISTINCT FROM NEW.call_rate_per_minute)
  EXECUTE FUNCTION public.guard_profile_call_rate();

CREATE OR REPLACE FUNCTION public.guard_profile_gender_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
  _old_norm text;
  _new_norm text;
BEGIN
  _old_norm := NULLIF(lower(btrim(COALESCE(OLD.gender, ''))), '');
  _new_norm := NULLIF(lower(btrim(COALESCE(NEW.gender, ''))), '');

  IF _old_norm IS NOT DISTINCT FROM _new_norm THEN
    RETURN NEW;
  END IF;

  IF _bypass THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()))
     OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF _old_norm IS NULL AND _new_norm IN ('male', 'female') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Gender is locked once set. Contact support to change.';
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_profile_gender_lock ON public.profiles;
CREATE TRIGGER tg_guard_profile_gender_lock
  BEFORE UPDATE OF gender ON public.profiles
  FOR EACH ROW
  WHEN (OLD.gender IS DISTINCT FROM NEW.gender)
  EXECUTE FUNCTION public.guard_profile_gender_lock();