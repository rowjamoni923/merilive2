CREATE TABLE IF NOT EXISTS public.admin_security_pin (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  pin_hash text NOT NULL,
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz
);
ALTER TABLE public.admin_security_pin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_security_pin;
CREATE POLICY "Admin session full access"
  ON public.admin_security_pin FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.admin_pin_trusted_devices (
  device_fingerprint text PRIMARY KEY,
  trusted_at timestamptz NOT NULL DEFAULT now(),
  trusted_by_admin uuid,
  user_agent text
);
ALTER TABLE public.admin_pin_trusted_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_pin_trusted_devices;
CREATE POLICY "Admin session full access"
  ON public.admin_pin_trusted_devices FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.admin_pin_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  otp_hash text NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_pin_otp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_pin_otp;
CREATE POLICY "Admin session full access"
  ON public.admin_pin_otp FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE OR REPLACE FUNCTION public.hash_admin_pin(_pin text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest('mlv-vault-2026::' || _pin, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists boolean; v_locked_until timestamptz;
BEGIN
  SELECT true, locked_until INTO v_exists, v_locked_until FROM public.admin_security_pin WHERE id = true;
  RETURN jsonb_build_object(
    'pin_set', COALESCE(v_exists, false),
    'locked', (v_locked_until IS NOT NULL AND v_locked_until > now()),
    'locked_until', v_locked_until
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_pin_set(_admin_id uuid, _new_pin text, _current_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_active boolean; v_existing_hash text;
BEGIN
  SELECT role, is_active INTO v_role, v_active FROM public.admin_users WHERE id = _admin_id;
  IF v_role IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Admin not found'); END IF;
  IF v_role <> 'owner' OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active owners can set the vault PIN');
  END IF;
  IF _new_pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 6 digits');
  END IF;
  SELECT pin_hash INTO v_existing_hash FROM public.admin_security_pin WHERE id = true;
  IF v_existing_hash IS NOT NULL THEN
    IF _current_pin IS NULL OR public.hash_admin_pin(_current_pin) <> v_existing_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'Current PIN is incorrect');
    END IF;
  END IF;
  INSERT INTO public.admin_security_pin (id, pin_hash, set_by, set_at, failed_attempts, locked_until)
    VALUES (true, public.hash_admin_pin(_new_pin), _admin_id, now(), 0, NULL)
    ON CONFLICT (id) DO UPDATE
      SET pin_hash = EXCLUDED.pin_hash, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at,
          failed_attempts = 0, locked_until = NULL;
  DELETE FROM public.admin_pin_trusted_devices;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_pin_verify(_pin text, _device_fingerprint text, _user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.admin_security_pin%ROWTYPE;
BEGIN
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
    INSERT INTO public.admin_pin_trusted_devices (device_fingerprint, trusted_at, user_agent)
      VALUES (_device_fingerprint, now(), _user_agent)
      ON CONFLICT (device_fingerprint) DO UPDATE SET trusted_at = EXCLUDED.trusted_at, user_agent = EXCLUDED.user_agent;
    RETURN jsonb_build_object('success', true);
  ELSE
    UPDATE public.admin_security_pin
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE id = true;
    RETURN jsonb_build_object('success', false, 'error', 'Incorrect PIN',
      'attempts_remaining', GREATEST(0, 5 - (v_row.failed_attempts + 1)));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_pin_device_trusted(_device_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pin_set boolean; v_trusted boolean;
BEGIN
  SELECT (pin_hash IS NOT NULL) INTO v_pin_set FROM public.admin_security_pin WHERE id = true;
  v_pin_set := COALESCE(v_pin_set, false);
  IF NOT v_pin_set THEN RETURN jsonb_build_object('trusted', true, 'pin_set', false); END IF;
  SELECT EXISTS(SELECT 1 FROM public.admin_pin_trusted_devices WHERE device_fingerprint = _device_fingerprint) INTO v_trusted;
  RETURN jsonb_build_object('trusted', v_trusted, 'pin_set', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_pin_request_reset()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_owner_email text; v_otp text; v_otp_hash text;
BEGIN
  SELECT lower(email) INTO v_owner_email FROM public.admin_users
    WHERE role = 'owner' AND is_active = true ORDER BY created_at ASC LIMIT 1;
  IF v_owner_email IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No active owner email found'); END IF;
  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_otp_hash := encode(extensions.digest('mlv-pin-otp::' || v_otp, 'sha256'), 'hex');
  UPDATE public.admin_pin_otp SET consumed_at = now() WHERE email = v_owner_email AND consumed_at IS NULL;
  INSERT INTO public.admin_pin_otp (otp_hash, email, expires_at)
    VALUES (v_otp_hash, v_owner_email, now() + interval '10 minutes');
  RETURN jsonb_build_object('success', true, 'email', v_owner_email, 'otp_plain', v_otp);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_pin_request_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pin_request_reset() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_pin_reset_with_otp(_otp text, _new_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_otp_hash text; v_row public.admin_pin_otp%ROWTYPE;
BEGIN
  IF _new_pin !~ '^[0-9]{6}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 6 digits'); END IF;
  IF _otp IS NULL OR _otp !~ '^[0-9]{6}$' THEN RETURN jsonb_build_object('success', false, 'error', 'OTP must be 6 digits'); END IF;
  v_otp_hash := encode(extensions.digest('mlv-pin-otp::' || _otp, 'sha256'), 'hex');
  SELECT * INTO v_row FROM public.admin_pin_otp
    WHERE otp_hash = v_otp_hash AND consumed_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'OTP invalid or expired'); END IF;
  UPDATE public.admin_pin_otp SET consumed_at = now() WHERE id = v_row.id;
  INSERT INTO public.admin_security_pin (id, pin_hash, set_at, failed_attempts, locked_until)
    VALUES (true, public.hash_admin_pin(_new_pin), now(), 0, NULL)
    ON CONFLICT (id) DO UPDATE
      SET pin_hash = EXCLUDED.pin_hash, set_at = now(), failed_attempts = 0, locked_until = NULL;
  DELETE FROM public.admin_pin_trusted_devices;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_pin_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_set(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_verify(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_device_trusted(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) TO anon, authenticated;