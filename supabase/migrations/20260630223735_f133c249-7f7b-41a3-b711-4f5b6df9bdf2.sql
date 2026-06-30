
-- ============================================================
-- Female → Host profile at signup (verification still required for going live)
-- ============================================================

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

  -- NEW POLICY: female = host profile immediately, verification badge waits for face check
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
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender, 'male'),
    updated_at = now();

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
END;
$function$;

-- ============================================================
-- Gender change trigger: female → host immediately (not waiting for face)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_host_role_from_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gender = 'female' AND (TG_OP = 'INSERT' OR OLD.gender IS DISTINCT FROM 'female') THEN
    -- Female: host profile immediately
    NEW.is_host := true;
    IF NEW.is_face_verified IS TRUE THEN
      IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('blocked','rejected') THEN
        NEW.host_status := 'approved';
      END IF;
    ELSE
      IF NEW.host_status IS NULL OR NEW.host_status = '' OR NEW.host_status = 'approved' THEN
        NEW.host_status := 'pending_face';
      END IF;
    END IF;
  END IF;

  IF NEW.gender = 'male' AND (TG_OP = 'INSERT' OR OLD.gender IS DISTINCT FROM 'male') THEN
    NEW.is_host := false;
    NEW.host_status := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- Face verification trigger: flip host_status to approved (is_host already true)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_host_role_from_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gender = 'female' THEN
    IF NEW.is_face_verified IS TRUE AND (OLD.is_face_verified IS DISTINCT FROM TRUE) THEN
      NEW.is_host := true;
      IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('blocked','rejected') THEN
        NEW.host_status := 'approved';
      END IF;
    ELSIF NEW.is_face_verified IS NOT TRUE AND OLD.is_face_verified IS TRUE THEN
      -- Verification revoked → stay host profile but pending_face again
      NEW.is_host := true;
      IF NEW.host_status = 'approved' THEN
        NEW.host_status := 'pending_face';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- Permit security trigger to allow female pending_face host promotion
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_profile_update_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
      RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true) THEN
      RETURN NEW;
    END IF;

    IF (NEW.host_status IS DISTINCT FROM OLD.host_status) THEN
      IF (NEW.host_status = 'approved' AND NEW.gender = 'female' AND NEW.is_face_verified IS TRUE) THEN
        RETURN NEW;
      END IF;
      IF (NEW.host_status = 'pending_face') THEN
        RETURN NEW;
      END IF;
      IF (NEW.host_status = 'approved' OR NEW.host_status = 'rejected') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can approve or reject hosts.';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================
-- Backfill existing female accounts → host profile (verification untouched)
-- ============================================================
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = true,
      host_status = CASE
        WHEN host_status IN ('blocked','rejected','approved') THEN host_status
        ELSE 'pending_face'
      END,
      updated_at = now()
  WHERE gender = 'female'
    AND is_deleted = false
    AND is_host IS DISTINCT FROM true;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;
