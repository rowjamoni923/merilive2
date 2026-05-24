-- Pkg309 pass-2: harden Admin Vault PIN RPCs against spoofed owner ids and public reset abuse

CREATE OR REPLACE FUNCTION public.admin_session_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_role text;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM public.admin_users
  WHERE id = v_admin_id
    AND is_active = true
  LIMIT 1;

  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin_owner_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_session_role() = 'owner';
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_set(_admin_id uuid, _new_pin text, _current_pin text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_existing_hash text;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL OR NOT public.is_active_admin_owner_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only an active owner admin session can set the vault PIN');
  END IF;

  IF _admin_id IS DISTINCT FROM v_admin_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session mismatch');
  END IF;

  IF _new_pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 6 digits');
  END IF;

  SELECT pin_hash INTO v_existing_hash
  FROM public.admin_security_pin
  WHERE id = true;

  IF v_existing_hash IS NOT NULL THEN
    IF _current_pin IS NULL OR public.hash_admin_pin(_current_pin) <> v_existing_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'Current PIN is incorrect');
    END IF;
  END IF;

  INSERT INTO public.admin_security_pin (id, pin_hash, set_by, set_at, failed_attempts, locked_until)
    VALUES (true, public.hash_admin_pin(_new_pin), v_admin_id, now(), 0, NULL)
    ON CONFLICT (id) DO UPDATE
      SET pin_hash = EXCLUDED.pin_hash,
          set_by = EXCLUDED.set_by,
          set_at = EXCLUDED.set_at,
          failed_attempts = 0,
          locked_until = NULL;

  DELETE FROM public.admin_pin_trusted_devices;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_verify(_pin text, _device_fingerprint text, _user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_security_pin%ROWTYPE;
  v_admin_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session required');
  END IF;

  SELECT * INTO v_row FROM public.admin_security_pin WHERE id = true;
  IF v_row.pin_hash IS NULL THEN
    RETURN jsonb_build_object('success', true, 'no_pin', true);
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN entry locked. Try again later.', 'locked_until', v_row.locked_until);
  END IF;

  IF _pin IS NULL OR _pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN must be 6 digits');
  END IF;

  IF public.hash_admin_pin(_pin) = v_row.pin_hash THEN
    UPDATE public.admin_security_pin SET failed_attempts = 0, locked_until = NULL WHERE id = true;
    INSERT INTO public.admin_pin_trusted_devices (device_fingerprint, trusted_at, trusted_by_admin, user_agent)
      VALUES (_device_fingerprint, now(), v_admin_id, _user_agent)
      ON CONFLICT (device_fingerprint) DO UPDATE
        SET trusted_at = EXCLUDED.trusted_at,
            trusted_by_admin = EXCLUDED.trusted_by_admin,
            user_agent = EXCLUDED.user_agent;
    RETURN jsonb_build_object('success', true);
  END IF;

  UPDATE public.admin_security_pin
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
   WHERE id = true;

  RETURN jsonb_build_object('success', false, 'error', 'Incorrect PIN',
    'attempts_remaining', GREATEST(0, 5 - (v_row.failed_attempts + 1)));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_device_trusted(_device_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin_set boolean;
  v_trusted boolean;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('trusted', false, 'pin_set', true, 'error', 'Admin session required');
  END IF;

  SELECT (pin_hash IS NOT NULL) INTO v_pin_set FROM public.admin_security_pin WHERE id = true;
  v_pin_set := COALESCE(v_pin_set, false);
  IF NOT v_pin_set THEN
    RETURN jsonb_build_object('trusted', true, 'pin_set', false);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.admin_pin_trusted_devices
    WHERE device_fingerprint = _device_fingerprint
      AND trusted_at > now() - interval '12 hours'
  ) INTO v_trusted;

  RETURN jsonb_build_object('trusted', v_trusted, 'pin_set', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_reset_with_otp(_otp text, _new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_otp_hash text;
  v_row public.admin_pin_otp%ROWTYPE;
  v_owner_id uuid;
BEGIN
  IF NOT public.is_active_admin_owner_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only an active owner admin session can reset the vault PIN');
  END IF;

  IF _new_pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 6 digits');
  END IF;
  IF _otp IS NULL OR _otp !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP must be 6 digits');
  END IF;

  v_otp_hash := encode(extensions.digest('mlv-pin-otp::' || _otp, 'sha256'), 'hex');
  SELECT * INTO v_row
  FROM public.admin_pin_otp
  WHERE otp_hash = v_otp_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP invalid or expired');
  END IF;

  v_owner_id := public.current_admin_id_from_header();
  UPDATE public.admin_pin_otp SET consumed_at = now() WHERE id = v_row.id;

  INSERT INTO public.admin_security_pin (id, pin_hash, set_by, set_at, failed_attempts, locked_until)
    VALUES (true, public.hash_admin_pin(_new_pin), v_owner_id, now(), 0, NULL)
    ON CONFLICT (id) DO UPDATE
      SET pin_hash = EXCLUDED.pin_hash,
          set_by = EXCLUDED.set_by,
          set_at = now(),
          failed_attempts = 0,
          locked_until = NULL;

  DELETE FROM public.admin_pin_trusted_devices;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_session_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_session_role() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_active_admin_owner_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin_owner_session() TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_pin_request_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pin_request_reset() TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pin_set(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_verify(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_device_trusted(text) TO anon, authenticated;