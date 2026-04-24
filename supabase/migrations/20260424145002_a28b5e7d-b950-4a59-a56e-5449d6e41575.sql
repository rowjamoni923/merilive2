-- =====================================================================
-- 1. Sign-up: Female starts as pending_face (NOT host yet)
-- =====================================================================
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

  -- Female accounts await face verification before becoming host
  IF _gender = 'female' THEN
    _host_status := 'pending_face';
  ELSE
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
    false, false, false, _host_status, false,
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

-- =====================================================================
-- 2. Replace gender-based auto-host with: gender female → pending_face only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sync_host_role_from_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gender = 'female' AND (TG_OP = 'INSERT' OR OLD.gender IS DISTINCT FROM 'female') THEN
    -- Female: NOT host until face verified
    NEW.is_host := COALESCE(NEW.is_face_verified, false);
    IF NEW.is_face_verified IS TRUE THEN
      IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('approved','blocked','rejected') THEN
        NEW.host_status := 'approved';
      END IF;
    ELSE
      IF NEW.host_status IS NULL OR NEW.host_status = '' OR NEW.host_status = 'approved' THEN
        NEW.host_status := 'pending_face';
      END IF;
    END IF;
  END IF;

  IF NEW.gender = 'male' AND (TG_OP = 'INSERT' OR OLD.gender IS DISTINCT FROM 'male') THEN
    -- Switching to male: not a host
    NEW.is_host := false;
    NEW.host_status := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- 3. NEW trigger: face verification approved → grant host status
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sync_host_role_from_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act on females (males never become hosts via gender)
  IF NEW.gender = 'female' THEN
    IF NEW.is_face_verified IS TRUE AND (OLD.is_face_verified IS DISTINCT FROM TRUE) THEN
      -- Face just got verified → become host (unless explicitly blocked/rejected)
      NEW.is_host := true;
      IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('blocked','rejected') THEN
        NEW.host_status := 'approved';
      END IF;
    ELSIF NEW.is_face_verified IS NOT TRUE AND OLD.is_face_verified IS TRUE THEN
      -- Face verification was revoked → lose host status
      NEW.is_host := false;
      IF NEW.host_status = 'approved' THEN
        NEW.host_status := 'pending_face';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_host_role_from_face_verification ON public.profiles;
CREATE TRIGGER trg_sync_host_role_from_face_verification
BEFORE UPDATE OF is_face_verified ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_host_role_from_face_verification();

-- =====================================================================
-- 4. Patch security trigger to allow face-verification-driven host promotion
-- =====================================================================
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
      -- Allowed: female + just-verified face → approved
      IF (NEW.host_status = 'approved' AND NEW.gender = 'female' AND NEW.is_face_verified IS TRUE) THEN
        RETURN NEW;
      END IF;
      -- Allowed: female + face revoked → pending_face
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

-- =====================================================================
-- 5. BACKFILL: revert all 1,538 female users that were wrongly marked host
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  -- Females without face verification → not host, pending_face
  UPDATE public.profiles
  SET is_host = false,
      host_status = CASE 
        WHEN host_status IN ('blocked','rejected') THEN host_status
        ELSE 'pending_face'
      END,
      updated_at = now()
  WHERE gender = 'female' 
    AND is_deleted = false
    AND (is_face_verified IS NOT TRUE);

  -- Females WITH face verification → host approved (none currently, but for safety)
  UPDATE public.profiles
  SET is_host = true,
      host_status = CASE 
        WHEN host_status IN ('blocked','rejected') THEN host_status
        ELSE 'approved'
      END,
      updated_at = now()
  WHERE gender = 'female' 
    AND is_deleted = false
    AND is_face_verified = true
    AND (is_host IS NOT TRUE OR host_status NOT IN ('approved','blocked','rejected'));

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;