
-- 1) handle_new_user: persist phone_number, phone_verified, dial code, country_code/name/flag
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
  _phone TEXT;
  _phone_verified BOOLEAN;
  _dial_code TEXT;
  _country_code TEXT;
  _country_name TEXT;
  _country_flag TEXT;
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

  _phone := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone_number', '')), '');
  _phone_verified := COALESCE((NEW.raw_user_meta_data->>'phone_verified')::boolean, false);
  _dial_code := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone_dial_code', '')), '');
  _country_code := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'country_code', '')), '');
  _country_name := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'country_name', '')), '');
  _country_flag := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'country_flag', '')), '');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.profiles (
    id, app_uid, display_name, username, email, avatar_url,
    coins, diamonds, beans, beans_balance, user_level, host_level,
    is_verified, is_face_verified, is_host, host_status, is_online,
    device_id, gender, is_deleted,
    phone_number, phone_verified,
    country_code, country_name, country_flag,
    signup_country_code, signup_country_name, signup_country_flag,
    created_at, updated_at, last_seen, last_seen_at
  ) VALUES (
    NEW.id, _app_uid, _display_name,
    CASE WHEN NEW.email IS NOT NULL AND NEW.email !~ '@meri\.local$' THEN split_part(NEW.email, '@', 1) ELSE NULL END,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''), NULLIF(NEW.raw_user_meta_data->>'picture', ''), ''),
    0, 0, 0, 0, 1, 0,
    false, false, _is_host, _host_status, false,
    NULLIF(NEW.raw_user_meta_data->>'device_id', ''), _gender, false,
    _phone, _phone_verified,
    _country_code, _country_name, _country_flag,
    _country_code, _country_name, _country_flag,
    now(), now(), now(), now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    device_id = COALESCE(EXCLUDED.device_id, public.profiles.device_id),
    phone_number = COALESCE(public.profiles.phone_number, EXCLUDED.phone_number),
    phone_verified = COALESCE(NULLIF(public.profiles.phone_verified, false), EXCLUDED.phone_verified, public.profiles.phone_verified),
    country_code = COALESCE(public.profiles.country_code, EXCLUDED.country_code),
    country_name = COALESCE(public.profiles.country_name, EXCLUDED.country_name),
    country_flag = COALESCE(public.profiles.country_flag, EXCLUDED.country_flag),
    signup_country_code = COALESCE(public.profiles.signup_country_code, EXCLUDED.signup_country_code),
    signup_country_name = COALESCE(public.profiles.signup_country_name, EXCLUDED.signup_country_name),
    signup_country_flag = COALESCE(public.profiles.signup_country_flag, EXCLUDED.signup_country_flag),
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

-- 2) protect_sensitive_profile_columns: allow one-time owner backfill for phone_number & phone_verified
CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bypass_protection boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
  _is_privileged boolean := false;
  _is_owner_row boolean := false;
BEGIN
  IF _bypass_protection THEN
    RETURN NEW;
  END IF;

  _is_privileged := current_setting('request.jwt.claim.role', true) = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()));

  IF _is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _is_owner_row := auth.uid() IS NOT NULL AND auth.uid() = NEW.id;

    IF NEW.coins IS DISTINCT FROM OLD.coins THEN RAISE EXCEPTION 'Direct modification of coins is not allowed'; END IF;
    IF NEW.beans IS DISTINCT FROM OLD.beans THEN RAISE EXCEPTION 'Direct modification of beans is not allowed'; END IF;
    IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN RAISE EXCEPTION 'Direct modification of diamonds is not allowed'; END IF;
    IF NEW.beans_balance IS DISTINCT FROM OLD.beans_balance THEN RAISE EXCEPTION 'Direct modification of beans_balance is not allowed'; END IF;
    IF NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN RAISE EXCEPTION 'Direct modification of total_earnings is not allowed'; END IF;
    IF NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings THEN RAISE EXCEPTION 'Direct modification of pending_earnings is not allowed'; END IF;
    IF NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings THEN RAISE EXCEPTION 'Direct modification of weekly_earnings is not allowed'; END IF;
    IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN RAISE EXCEPTION 'Direct modification of total_consumption is not allowed'; END IF;
    IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged THEN RAISE EXCEPTION 'Direct modification of total_recharged is not allowed'; END IF;
    IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN RAISE EXCEPTION 'Direct modification of user_level is not allowed'; END IF;
    IF NEW.max_user_level IS DISTINCT FROM OLD.max_user_level THEN RAISE EXCEPTION 'Direct modification of max_user_level is not allowed'; END IF;
    IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN RAISE EXCEPTION 'Direct modification of host_level is not allowed'; END IF;
    IF NEW.previous_host_level IS DISTINCT FROM OLD.previous_host_level THEN RAISE EXCEPTION 'Direct modification of previous_host_level is not allowed'; END IF;
    IF NEW.current_vip_tier_id IS DISTINCT FROM OLD.current_vip_tier_id THEN RAISE EXCEPTION 'Direct modification of current_vip_tier_id is not allowed'; END IF;
    IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN RAISE EXCEPTION 'Direct modification of vip_expires_at is not allowed'; END IF;
    IF NEW.vip_tier IS DISTINCT FROM OLD.vip_tier THEN RAISE EXCEPTION 'Direct modification of vip_tier is not allowed'; END IF;

    IF NEW.is_host IS DISTINCT FROM OLD.is_host THEN RAISE EXCEPTION 'Direct modification of is_host is not allowed'; END IF;
    IF NEW.host_status IS DISTINCT FROM OLD.host_status THEN RAISE EXCEPTION 'Direct modification of host_status is not allowed'; END IF;
    IF NEW.host_verified_at IS DISTINCT FROM OLD.host_verified_at THEN RAISE EXCEPTION 'Direct modification of host_verified_at is not allowed'; END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN RAISE EXCEPTION 'Direct modification of is_verified is not allowed'; END IF;
    IF NEW.is_face_verified IS DISTINCT FROM OLD.is_face_verified THEN RAISE EXCEPTION 'Direct modification of is_face_verified is not allowed'; END IF;
    IF NEW.face_verification_status IS DISTINCT FROM OLD.face_verification_status THEN RAISE EXCEPTION 'Direct modification of face_verification_status is not allowed'; END IF;
    IF NEW.face_verification_image IS DISTINCT FROM OLD.face_verification_image THEN RAISE EXCEPTION 'Direct modification of face_verification_image is not allowed'; END IF;
    IF NEW.face_verified_at IS DISTINCT FROM OLD.face_verified_at THEN RAISE EXCEPTION 'Direct modification of face_verified_at is not allowed'; END IF;
    IF NEW.verification_type IS DISTINCT FROM OLD.verification_type THEN RAISE EXCEPTION 'Direct modification of verification_type is not allowed'; END IF;
    IF NEW.face_hash IS DISTINCT FROM OLD.face_hash THEN RAISE EXCEPTION 'Direct modification of face_hash is not allowed'; END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN RAISE EXCEPTION 'Direct modification of is_blocked is not allowed'; END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN RAISE EXCEPTION 'Direct modification of is_banned is not allowed'; END IF;
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN RAISE EXCEPTION 'Direct modification of is_deleted is not allowed'; END IF;
    IF NEW.blocked_at IS DISTINCT FROM OLD.blocked_at THEN RAISE EXCEPTION 'Direct modification of blocked_at is not allowed'; END IF;
    IF NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason THEN RAISE EXCEPTION 'Direct modification of blocked_reason is not allowed'; END IF;
    IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN RAISE EXCEPTION 'Direct modification of deletion_requested_at is not allowed'; END IF;
    IF NEW.deletion_scheduled_at IS DISTINCT FROM OLD.deletion_scheduled_at THEN RAISE EXCEPTION 'Direct modification of deletion_scheduled_at is not allowed'; END IF;

    IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN RAISE EXCEPTION 'Direct modification of agency_id is not allowed'; END IF;
    IF NEW.is_agency_owner IS DISTINCT FROM OLD.is_agency_owner THEN RAISE EXCEPTION 'Direct modification of is_agency_owner is not allowed'; END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'Direct modification of email is not allowed'; END IF;

    -- phone_number: row owner may backfill once (NULL -> non-empty); re-assignment blocked.
    IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
      IF NOT (
        _is_owner_row
        AND OLD.phone_number IS NULL
        AND NEW.phone_number IS NOT NULL
        AND length(btrim(NEW.phone_number)) > 0
      ) THEN
        RAISE EXCEPTION 'Direct modification of phone_number is not allowed';
      END IF;
    END IF;

    -- phone_verified: row owner may flip false -> true once phone_number is set.
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      IF NOT (
        _is_owner_row
        AND COALESCE(OLD.phone_verified, false) = false
        AND NEW.phone_verified = true
        AND NEW.phone_number IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Direct modification of phone_verified is not allowed';
      END IF;
    END IF;

    -- device_id: row owner may backfill once (NULL -> non-empty); re-assignment blocked.
    IF NEW.device_id IS DISTINCT FROM OLD.device_id THEN
      IF NOT (
        _is_owner_row
        AND OLD.device_id IS NULL
        AND NEW.device_id IS NOT NULL
        AND length(btrim(NEW.device_id)) > 0
      ) THEN
        RAISE EXCEPTION 'Direct modification of device_id is not allowed';
      END IF;
    END IF;

    IF NEW.active_session_id IS DISTINCT FROM OLD.active_session_id THEN RAISE EXCEPTION 'Direct modification of active_session_id is not allowed'; END IF;

    IF NEW.registration_ip IS DISTINCT FROM OLD.registration_ip THEN
      IF NOT (_is_owner_row AND OLD.registration_ip IS NULL AND NEW.registration_ip IS NOT NULL) THEN
        RAISE EXCEPTION 'Direct modification of registration_ip is not allowed';
      END IF;
    END IF;
    IF NEW.registration_user_agent IS DISTINCT FROM OLD.registration_user_agent THEN
      IF NOT (_is_owner_row AND OLD.registration_user_agent IS NULL AND NEW.registration_user_agent IS NOT NULL) THEN
        RAISE EXCEPTION 'Direct modification of registration_user_agent is not allowed';
      END IF;
    END IF;
    IF NEW.registration_device_info IS DISTINCT FROM OLD.registration_device_info THEN
      IF NOT (_is_owner_row AND OLD.registration_device_info IS NULL AND NEW.registration_device_info IS NOT NULL) THEN
        RAISE EXCEPTION 'Direct modification of registration_device_info is not allowed';
      END IF;
    END IF;

    IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip AND NOT _is_owner_row THEN
      RAISE EXCEPTION 'Direct modification of last_login_ip is not allowed';
    END IF;
    IF NEW.last_login_device_info IS DISTINCT FROM OLD.last_login_device_info AND NOT _is_owner_row THEN
      RAISE EXCEPTION 'Direct modification of last_login_device_info is not allowed';
    END IF;
    IF NEW.last_login_device IS DISTINCT FROM OLD.last_login_device AND NOT _is_owner_row THEN
      RAISE EXCEPTION 'Direct modification of last_login_device is not allowed';
    END IF;
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at AND NOT _is_owner_row THEN
      RAISE EXCEPTION 'Direct modification of last_login_at is not allowed';
    END IF;

    IF NEW.phone_violation_count IS DISTINCT FROM OLD.phone_violation_count THEN RAISE EXCEPTION 'Direct modification of phone_violation_count is not allowed'; END IF;
    IF NEW.profile_photo_url IS DISTINCT FROM OLD.profile_photo_url THEN RAISE EXCEPTION 'Direct modification of profile_photo_url is not allowed'; END IF;
    IF NEW.host_photos IS DISTINCT FROM OLD.host_photos THEN RAISE EXCEPTION 'Direct modification of host_photos is not allowed'; END IF;
    IF NEW.frame_id IS DISTINCT FROM OLD.frame_id THEN RAISE EXCEPTION 'Direct modification of frame_id is not allowed'; END IF;
  END IF;

  RETURN NEW;
END;
$function$;
