CREATE OR REPLACE FUNCTION public.admin_change_own_password(p_admin_user_id uuid, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_admin_user_id IS DISTINCT FROM public.current_admin_id_from_header() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only change own password');
  END IF;

  IF length(coalesce(p_new_password, '')) < 8 OR length(coalesce(p_new_password, '')) > 128 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be 8-128 characters');
  END IF;

  UPDATE public.admin_users
     SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         password_set_at = now(),
         must_change_password = false,
         updated_at = now()
   WHERE id = p_admin_user_id
     AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;

  DELETE FROM public.admin_sessions
   WHERE admin_user_id = p_admin_user_id
     AND session_token IS DISTINCT FROM public.current_admin_token_from_header();

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.service_set_admin_password(_admin_user_id uuid, _new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service role required');
  END IF;

  IF _admin_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_user_id is required');
  END IF;

  IF length(coalesce(_new_password, '')) < 8 OR length(coalesce(_new_password, '')) > 128 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be 8-128 characters');
  END IF;

  UPDATE public.admin_users
     SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf', 10)),
         password_set_at = now(),
         must_change_password = false,
         updated_at = now()
   WHERE id = _admin_user_id
     AND role <> 'owner';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sub-admin not found');
  END IF;

  DELETE FROM public.admin_sessions WHERE admin_user_id = _admin_user_id;
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_owner(_admin_id uuid, _new_email text, _display_name text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_email text := lower(trim(coalesce(_new_email, '')));
BEGIN
  IF v_admin_id IS NULL OR v_admin_id IS DISTINCT FROM _admin_id OR public.admin_session_role() <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the active owner admin session can add owners');
  END IF;

  IF v_email = '' OR length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email');
  END IF;

  INSERT INTO public.admin_owner_whitelist (email, display_name, added_by, is_active)
  VALUES (v_email, NULLIF(left(trim(coalesce(_display_name, '')), 80), ''), v_admin_id, true)
  ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    display_name = COALESCE(EXCLUDED.display_name, public.admin_owner_whitelist.display_name),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'email', v_email);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_request_device_access(
  _admin_id uuid,
  _device_fingerprint text,
  _device_name text DEFAULT NULL::text,
  _device_info jsonb DEFAULT NULL::jsonb,
  _ip_address text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin record;
  v_device record;
  v_device_id uuid;
  v_token_admin_id uuid;
  v_fingerprint text := left(coalesce(_device_fingerprint, ''), 256);
  v_device_info jsonb := COALESCE(_device_info, '{}'::jsonb);
BEGIN
  v_token_admin_id := public.current_admin_login_id_from_header();
  IF v_token_admin_id IS NULL OR v_token_admin_id IS DISTINCT FROM _admin_id THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid', 'error', 'Invalid admin session');
  END IF;

  IF length(v_fingerprint) < 16 OR v_fingerprint !~ '^[A-Za-z0-9:_-]{16,256}$' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid', 'error', 'Invalid device fingerprint');
  END IF;

  IF jsonb_typeof(v_device_info) IS DISTINCT FROM 'object' OR length(v_device_info::text) > 4000 THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid', 'error', 'Invalid device metadata');
  END IF;

  SELECT id, email, role, is_active INTO v_admin
  FROM public.admin_users
  WHERE id = _admin_id AND is_active = true
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;

  IF v_admin.role = 'owner' THEN
    INSERT INTO public.admin_allowed_devices (
      admin_user_id, device_fingerprint, device_name, device_info,
      ip_address, user_agent, status, approved_at, approved_by, last_used_at
    ) VALUES (
      _admin_id, v_fingerprint, NULLIF(left(coalesce(_device_name, ''), 160), ''), v_device_info,
      NULLIF(left(coalesce(_ip_address, ''), 80), ''), NULLIF(left(coalesce(_user_agent, ''), 500), ''), 'approved', now(), _admin_id, now()
    )
    ON CONFLICT (admin_user_id, device_fingerprint) DO UPDATE
      SET last_used_at = now(),
          status = 'approved',
          device_name = COALESCE(EXCLUDED.device_name, admin_allowed_devices.device_name),
          device_info = COALESCE(EXCLUDED.device_info, admin_allowed_devices.device_info),
          ip_address = COALESCE(EXCLUDED.ip_address, admin_allowed_devices.ip_address),
          user_agent = COALESCE(EXCLUDED.user_agent, admin_allowed_devices.user_agent),
          approved_at = COALESCE(admin_allowed_devices.approved_at, now()),
          approved_by = COALESCE(admin_allowed_devices.approved_by, _admin_id);

    UPDATE public.admin_sessions
    SET device_fingerprint = v_fingerprint,
        ip_address = COALESCE(NULLIF(left(coalesce(_ip_address, ''), 80), ''), ip_address),
        user_agent = COALESCE(NULLIF(left(coalesce(_user_agent, ''), 500), ''), user_agent),
        last_active_at = now()
    WHERE session_token = public.current_admin_token_from_header()
      AND admin_user_id = _admin_id;

    RETURN jsonb_build_object('success', true, 'status', 'approved', 'is_owner', true);
  END IF;

  SELECT id, status, rejection_reason INTO v_device
  FROM public.admin_allowed_devices
  WHERE admin_user_id = _admin_id AND device_fingerprint = v_fingerprint
  LIMIT 1;

  IF v_device.id IS NOT NULL THEN
    IF v_device.status = 'approved' THEN
      UPDATE public.admin_allowed_devices
      SET last_used_at = now(),
          ip_address = COALESCE(NULLIF(left(coalesce(_ip_address, ''), 80), ''), ip_address),
          user_agent = COALESCE(NULLIF(left(coalesce(_user_agent, ''), 500), ''), user_agent)
      WHERE id = v_device.id;

      UPDATE public.admin_sessions
      SET device_fingerprint = v_fingerprint,
          ip_address = COALESCE(NULLIF(left(coalesce(_ip_address, ''), 80), ''), ip_address),
          user_agent = COALESCE(NULLIF(left(coalesce(_user_agent, ''), 500), ''), user_agent),
          last_active_at = now()
      WHERE session_token = public.current_admin_token_from_header()
        AND admin_user_id = _admin_id;

      RETURN jsonb_build_object('success', true, 'status', 'approved', 'device_id', v_device.id);
    ELSIF v_device.status = 'rejected' THEN
      RETURN jsonb_build_object('success', false, 'status', 'rejected', 'error', COALESCE(v_device.rejection_reason, 'Device access rejected by owner'));
    ELSIF v_device.status = 'revoked' THEN
      UPDATE public.admin_allowed_devices
      SET status = 'pending', requested_at = now(),
          ip_address = COALESCE(NULLIF(left(coalesce(_ip_address, ''), 80), ''), ip_address),
          user_agent = COALESCE(NULLIF(left(coalesce(_user_agent, ''), 500), ''), user_agent)
      WHERE id = v_device.id;
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device.id);
    ELSE
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device.id);
    END IF;
  END IF;

  INSERT INTO public.admin_allowed_devices (
    admin_user_id, device_fingerprint, device_name, device_info,
    ip_address, user_agent, status, requested_at
  ) VALUES (
    _admin_id, v_fingerprint, NULLIF(left(coalesce(_device_name, ''), 160), ''), v_device_info,
    NULLIF(left(coalesce(_ip_address, ''), 80), ''), NULLIF(left(coalesce(_user_agent, ''), 500), ''), 'pending', now()
  )
  RETURNING id INTO v_device_id;

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_check_device_status(_admin_id uuid, _device_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_role text;
  v_device record;
  v_token_admin_id uuid;
  v_fingerprint text := left(coalesce(_device_fingerprint, ''), 256);
BEGIN
  v_token_admin_id := public.current_admin_login_id_from_header();
  IF v_token_admin_id IS NULL OR v_token_admin_id IS DISTINCT FROM _admin_id THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF length(v_fingerprint) < 16 OR v_fingerprint !~ '^[A-Za-z0-9:_-]{16,256}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT role INTO v_admin_role
  FROM public.admin_users
  WHERE id = _admin_id AND is_active = true
  LIMIT 1;

  IF v_admin_role IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_admin_role = 'owner' THEN
    RETURN jsonb_build_object('status', 'approved', 'is_owner', true);
  END IF;

  SELECT id, status, rejection_reason INTO v_device
  FROM public.admin_allowed_devices
  WHERE admin_user_id = _admin_id AND device_fingerprint = v_fingerprint
  LIMIT 1;

  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_device.status = 'approved' THEN
    UPDATE public.admin_sessions
    SET device_fingerprint = v_fingerprint,
        last_active_at = now()
    WHERE session_token = public.current_admin_token_from_header()
      AND admin_user_id = _admin_id;
  END IF;

  RETURN jsonb_build_object(
    'status', v_device.status::text,
    'device_id', v_device.id,
    'rejection_reason', v_device.rejection_reason
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_pin_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
  v_locked_until timestamptz;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('pin_set', true, 'locked', false, 'locked_until', NULL, 'error', 'Admin session required');
  END IF;

  SELECT true, locked_until INTO v_exists, v_locked_until
  FROM public.admin_security_pin
  WHERE id = true;

  RETURN jsonb_build_object(
    'pin_set', COALESCE(v_exists, false),
    'locked', (v_locked_until IS NOT NULL AND v_locked_until > now()),
    'locked_until', v_locked_until
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_pin_device_trusted(_device_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pin_set boolean;
  v_trusted boolean;
  v_admin_id uuid;
  v_fingerprint text := left(coalesce(_device_fingerprint, ''), 256);
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('trusted', false, 'pin_set', true, 'error', 'Admin session required');
  END IF;

  IF length(v_fingerprint) < 16 OR v_fingerprint !~ '^[A-Za-z0-9:_-]{16,256}$' THEN
    RETURN jsonb_build_object('trusted', false, 'pin_set', true, 'error', 'Invalid device fingerprint');
  END IF;

  SELECT (pin_hash IS NOT NULL) INTO v_pin_set FROM public.admin_security_pin WHERE id = true;
  v_pin_set := COALESCE(v_pin_set, false);
  IF NOT v_pin_set THEN
    RETURN jsonb_build_object('trusted', true, 'pin_set', false);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.admin_pin_trusted_devices
    WHERE device_fingerprint = v_fingerprint
      AND trusted_by_admin = v_admin_id
      AND trusted_at > now() - interval '12 hours'
  ) INTO v_trusted;

  RETURN jsonb_build_object('trusted', v_trusted, 'pin_set', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_pin_verify(_pin text, _device_fingerprint text, _user_agent text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.admin_security_pin%ROWTYPE;
  v_admin_id uuid;
  v_fingerprint text := left(coalesce(_device_fingerprint, ''), 256);
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session required');
  END IF;

  IF length(v_fingerprint) < 16 OR v_fingerprint !~ '^[A-Za-z0-9:_-]{16,256}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid device fingerprint');
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
      VALUES (v_fingerprint, now(), v_admin_id, NULLIF(left(coalesce(_user_agent, ''), 500), ''))
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
$function$;

COMMENT ON FUNCTION public.admin_add_owner(uuid, text, text) IS 'Pkg339: owner whitelist changes require the approved custom admin session header; legacy auth.uid owner fallback is intentionally not accepted.';
COMMENT ON FUNCTION public.admin_request_device_access(uuid, text, text, jsonb, text, text) IS 'Pkg339: admin login/device bootstrap RPC; accepts only the admin id proven by x-admin-token and clamps device metadata.';
COMMENT ON FUNCTION public.admin_pin_status() IS 'Pkg339: Vault PIN status is visible only through an active approved admin session.';