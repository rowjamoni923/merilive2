CREATE OR REPLACE FUNCTION public._admin_device_fingerprint_is_valid(_fingerprint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT length(coalesce(_fingerprint, '')) BETWEEN 16 AND 256
     AND coalesce(_fingerprint, '') ~ '^[A-Za-z0-9:_-]+$';
$$;

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

  IF NOT public._admin_device_fingerprint_is_valid(v_fingerprint) THEN
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

  IF NOT public._admin_device_fingerprint_is_valid(v_fingerprint) THEN
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

  IF NOT public._admin_device_fingerprint_is_valid(v_fingerprint) THEN
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

  IF NOT public._admin_device_fingerprint_is_valid(v_fingerprint) THEN
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

GRANT EXECUTE ON FUNCTION public._admin_device_fingerprint_is_valid(text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public._admin_device_fingerprint_is_valid(text) IS 'Validates admin device fingerprints without bounded regex repetition that breaks PostgreSQL when upper bound exceeds 255.';
COMMENT ON FUNCTION public.admin_request_device_access(uuid, text, text, jsonb, text, text) IS 'Pkg342 hotfix: admin login/device bootstrap RPC with safe fingerprint validation; owner auto-approves, sub-admin follows device approval.';