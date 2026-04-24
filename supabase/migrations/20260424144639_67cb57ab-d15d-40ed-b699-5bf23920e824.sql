-- 1. Patch security trigger to allow gender-driven auto-conversion + bypass flag
CREATE OR REPLACE FUNCTION public.check_profile_update_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Allow during system bypass (used by SECURITY DEFINER admin RPCs, migrations, triggers)
    IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
      RETURN NEW;
    END IF;

    -- Allow if requester is an active admin
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true) THEN
      RETURN NEW;
    END IF;

    -- Allow gender→host auto-conversion: female + approved is the policy default
    IF (NEW.host_status IS DISTINCT FROM OLD.host_status) THEN
      IF (NEW.host_status = 'approved' AND NEW.gender = 'female' AND (OLD.gender IS DISTINCT FROM 'female' OR OLD.host_status IS NULL OR OLD.host_status = '')) THEN
        RETURN NEW;
      END IF;
      IF (NEW.host_status = 'approved' OR NEW.host_status = 'rejected') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can approve or reject hosts.';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Update handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _app_uid TEXT;
  _display_name TEXT;
  _gender TEXT;
  _is_host BOOLEAN;
  _host_status TEXT;
BEGIN
  LOOP
    _app_uid := 'U' || LPAD(FLOOR(RANDOM() * 99999999)::TEXT, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE app_uid = _app_uid);
  END LOOP;

  _display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    CASE WHEN NEW.email IS NOT NULL AND NEW.email !~ '@meri\.local$' THEN split_part(NEW.email, '@', 1) ELSE 'User' END
  );

  _gender := lower(NULLIF(BTRIM(NEW.raw_user_meta_data->>'gender'), ''));
  IF _gender NOT IN ('male', 'female') THEN _gender := 'male'; END IF;

  IF _gender = 'female' THEN
    _is_host := true; _host_status := 'approved';
  ELSE
    _is_host := false; _host_status := NULL;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.profiles (
    id, app_uid, display_name, username, email, avatar_url,
    coins, diamonds, beans, beans_balance, user_level, host_level,
    is_verified, is_face_verified, is_host, host_status, is_online,
    device_id, gender, is_deleted,
    created_at, updated_at, last_seen, last_seen_at
  ) VALUES (
    NEW.id, _app_uid, _display_name,
    CASE WHEN NEW.email IS NOT NULL AND NEW.email !~ '@meri\.local$' THEN split_part(NEW.email, '@', 1) ELSE NULL END,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''), NULLIF(NEW.raw_user_meta_data->>'picture', ''), ''),
    0, 0, 0, 0, 1, 0,
    false, false, _is_host, _host_status, false,
    NULLIF(NEW.raw_user_meta_data->>'device_id', ''), _gender, false,
    now(), now(), now(), now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    device_id = COALESCE(EXCLUDED.device_id, public.profiles.device_id),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender, 'male'),
    updated_at = now();

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
END;
$function$;

-- 3. Sync trigger
CREATE OR REPLACE FUNCTION public.sync_host_role_from_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gender = 'female' AND (TG_OP = 'INSERT' OR OLD.gender IS DISTINCT FROM 'female' OR NEW.is_host IS NOT TRUE OR NEW.host_status IS NULL) THEN
    NEW.is_host := true;
    IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('approved','pending','rejected','blocked') THEN
      NEW.host_status := 'approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_host_role_from_gender ON public.profiles;
CREATE TRIGGER trg_sync_host_role_from_gender
BEFORE INSERT OR UPDATE OF gender ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_host_role_from_gender();

-- 4. Backfill within bypass
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
  SET is_host = true,
      host_status = COALESCE(NULLIF(host_status, ''), 'approved'),
      updated_at = now()
  WHERE gender = 'female' AND is_deleted = false
    AND (is_host IS NOT TRUE OR host_status IS NULL OR host_status = '');
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;
