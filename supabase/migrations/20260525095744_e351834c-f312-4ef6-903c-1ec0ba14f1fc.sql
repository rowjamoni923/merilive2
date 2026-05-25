-- Pkg328 pass-2b: make current_admin_id_from_header device-bound by default

CREATE OR REPLACE FUNCTION public.current_admin_login_id_from_header()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_admin_id uuid;
BEGIN
  v_token := public.current_admin_token_from_header();
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.id
    INTO v_admin_id
  FROM public.admin_sessions s
  JOIN public.admin_users au ON au.id = s.admin_user_id
  WHERE s.session_token = v_token
    AND s.expires_at > now()
    AND au.is_active = true
  LIMIT 1;

  RETURN v_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_admin_id_from_header()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_admin_id uuid;
BEGIN
  v_token := public.current_admin_token_from_header();
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.id
    INTO v_admin_id
  FROM public.admin_sessions s
  JOIN public.admin_users au ON au.id = s.admin_user_id
  JOIN public.admin_allowed_devices d
    ON d.admin_user_id = au.id
   AND d.device_fingerprint = s.device_fingerprint
   AND d.status = 'approved'
  WHERE s.session_token = v_token
    AND s.expires_at > now()
    AND s.device_fingerprint IS NOT NULL
    AND au.is_active = true
  LIMIT 1;

  RETURN v_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_admin_id_from_header() IS NOT NULL;
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
SET search_path = public
AS $$
DECLARE
  v_admin record;
  v_device record;
  v_device_id uuid;
  v_token_admin_id uuid;
  v_fingerprint text := left(coalesce(_device_fingerprint, ''), 256);
BEGIN
  v_token_admin_id := public.current_admin_login_id_from_header();
  IF v_token_admin_id IS NULL OR v_token_admin_id <> _admin_id THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid', 'error', 'Invalid admin session');
  END IF;

  IF length(v_fingerprint) < 16 THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid', 'error', 'Invalid device fingerprint');
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
      _admin_id, v_fingerprint, left(_device_name, 160), COALESCE(_device_info, '{}'::jsonb),
      left(_ip_address, 80), left(_user_agent, 500), 'approved', now(), _admin_id, now()
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
        ip_address = COALESCE(left(_ip_address, 80), ip_address),
        user_agent = COALESCE(left(_user_agent, 500), user_agent),
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
          ip_address = COALESCE(left(_ip_address, 80), ip_address),
          user_agent = COALESCE(left(_user_agent, 500), user_agent)
      WHERE id = v_device.id;

      UPDATE public.admin_sessions
      SET device_fingerprint = v_fingerprint,
          ip_address = COALESCE(left(_ip_address, 80), ip_address),
          user_agent = COALESCE(left(_user_agent, 500), user_agent),
          last_active_at = now()
      WHERE session_token = public.current_admin_token_from_header()
        AND admin_user_id = _admin_id;

      RETURN jsonb_build_object('success', true, 'status', 'approved', 'device_id', v_device.id);
    ELSIF v_device.status = 'rejected' THEN
      RETURN jsonb_build_object('success', false, 'status', 'rejected', 'error', COALESCE(v_device.rejection_reason, 'Device access rejected by owner'));
    ELSIF v_device.status = 'revoked' THEN
      UPDATE public.admin_allowed_devices
      SET status = 'pending', requested_at = now(),
          ip_address = COALESCE(left(_ip_address, 80), ip_address),
          user_agent = COALESCE(left(_user_agent, 500), user_agent)
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
    _admin_id, v_fingerprint, left(_device_name, 160), COALESCE(_device_info, '{}'::jsonb),
    left(_ip_address, 80), left(_user_agent, 500), 'pending', now()
  )
  RETURNING id INTO v_device_id;

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_check_device_status(_admin_id uuid, _device_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role text;
  v_device record;
  v_token_admin_id uuid;
  v_fingerprint text := left(coalesce(_device_fingerprint, ''), 256);
BEGIN
  v_token_admin_id := public.current_admin_login_id_from_header();
  IF v_token_admin_id IS NULL OR v_token_admin_id <> _admin_id THEN
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
$$;

REVOKE EXECUTE ON FUNCTION public.current_admin_login_id_from_header() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_admin_login_id_from_header() TO anon, authenticated;