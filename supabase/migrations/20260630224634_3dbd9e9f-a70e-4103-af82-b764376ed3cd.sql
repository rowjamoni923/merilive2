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

  _gender := lower(NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'selected_gender',
    CASE WHEN lower(COALESCE(NEW.raw_user_meta_data->>'account_type', NEW.raw_user_meta_data->>'profile_type', NEW.raw_user_meta_data->>'role', '')) IN ('host','female_host') THEN 'female' END
  )), ''));
  IF _gender NOT IN ('male', 'female') THEN _gender := 'male'; END IF;

  IF _gender = 'female' THEN
    _is_host := true;
    _host_status := 'pending_face';
  ELSE
    _is_host := false;
    _host_status := NULL;
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
    gender = CASE
      WHEN public.profiles.gender IS NULL OR public.profiles.gender NOT IN ('male','female') THEN EXCLUDED.gender
      ELSE public.profiles.gender
    END,
    is_host = CASE
      WHEN COALESCE(public.profiles.gender, EXCLUDED.gender) = 'female' THEN true
      WHEN COALESCE(public.profiles.gender, EXCLUDED.gender) = 'male' THEN false
      ELSE public.profiles.is_host
    END,
    host_status = CASE
      WHEN COALESCE(public.profiles.gender, EXCLUDED.gender) = 'female' THEN
        CASE
          WHEN public.profiles.host_status IN ('blocked','rejected') THEN public.profiles.host_status
          WHEN public.profiles.is_face_verified IS TRUE THEN 'approved'
          ELSE 'pending_face'
        END
      ELSE NULL
    END,
    updated_at = now();

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_host_role_from_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
  _privileged boolean := current_setting('request.jwt.claim.role', true) = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()));
  _trusted boolean := TG_OP = 'INSERT' OR _bypass OR _privileged;
BEGIN
  NEW.gender := lower(NULLIF(BTRIM(COALESCE(NEW.gender, '')), ''));
  IF NEW.gender NOT IN ('male', 'female') THEN
    NEW.gender := COALESCE(OLD.gender, 'male');
  END IF;

  IF NOT _trusted THEN
    RETURN NEW;
  END IF;

  IF NEW.gender = 'female' THEN
    NEW.is_host := true;
    IF NEW.host_status IN ('blocked','rejected') THEN
      RETURN NEW;
    END IF;
    IF NEW.is_face_verified IS TRUE THEN
      NEW.host_status := 'approved';
    ELSE
      NEW.host_status := 'pending_face';
    END IF;
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
    NEW.host_status := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS aa_sync_host_role_from_gender ON public.profiles;
DROP TRIGGER IF EXISTS sync_host_role_from_gender_trigger ON public.profiles;
DROP TRIGGER IF EXISTS trg_sync_host_role_from_gender ON public.profiles;

CREATE TRIGGER aa_sync_host_role_from_gender
BEFORE INSERT OR UPDATE OF gender, is_face_verified, is_verified, host_status
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_host_role_from_gender();

CREATE OR REPLACE FUNCTION public.finalize_signup_profile(
  _display_name text DEFAULT NULL,
  _gender text DEFAULT NULL,
  _device_id text DEFAULT NULL
)
RETURNS TABLE(id uuid, gender text, is_host boolean, host_status text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _norm_gender text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _norm_gender := lower(NULLIF(BTRIM(COALESCE(_gender, '')), ''));
  IF _norm_gender NOT IN ('male', 'female') THEN
    _norm_gender := NULL;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles p
  SET
    display_name = COALESCE(NULLIF(BTRIM(_display_name), ''), p.display_name),
    device_id = COALESCE(NULLIF(BTRIM(_device_id), ''), p.device_id),
    gender = COALESCE(_norm_gender, p.gender, 'male'),
    is_host = CASE WHEN COALESCE(_norm_gender, p.gender, 'male') = 'female' THEN true ELSE false END,
    host_status = CASE
      WHEN COALESCE(_norm_gender, p.gender, 'male') = 'female' THEN
        CASE
          WHEN p.host_status IN ('blocked','rejected') THEN p.host_status
          WHEN p.is_face_verified IS TRUE THEN 'approved'
          ELSE 'pending_face'
        END
      ELSE NULL
    END,
    updated_at = now()
  WHERE p.id = _uid
    AND (p.is_face_verified IS NOT TRUE OR p.host_status IS NULL OR p.host_status = 'pending_face' OR p.created_at > now() - interval '30 days');

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN QUERY
  SELECT p.id, p.gender, p.is_host, p.host_status, p.display_name
  FROM public.profiles p
  WHERE p.id = _uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_signup_profile(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_signup_profile(text, text, text) TO service_role;

DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = true,
      host_status = CASE
        WHEN host_status IN ('blocked','rejected') THEN host_status
        WHEN is_face_verified IS TRUE THEN 'approved'
        ELSE 'pending_face'
      END,
      updated_at = now()
  WHERE gender = 'female'
    AND COALESCE(is_host, false) = false;

  UPDATE public.profiles
  SET is_host = false,
      host_status = NULL,
      updated_at = now()
  WHERE gender = 'male'
    AND COALESCE(is_host, false) = true
    AND COALESCE(host_status, '') <> 'approved';

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;