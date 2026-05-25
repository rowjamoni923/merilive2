-- Pkg328 pass-2: single-device and admin-device hardening

-- 1) Admin sessions are only active after their token has been bound to an approved device.
CREATE OR REPLACE FUNCTION public.is_active_admin_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_sessions s
    JOIN public.admin_users au ON au.id = s.admin_user_id
    LEFT JOIN public.admin_allowed_devices d
      ON d.admin_user_id = au.id
     AND d.device_fingerprint = s.device_fingerprint
     AND d.status = 'approved'
    WHERE s.session_token = public.current_admin_token_from_header()
      AND s.expires_at > now()
      AND au.is_active = true
      AND (
        au.role = 'owner'
        OR d.id IS NOT NULL
      )
      AND s.device_fingerprint IS NOT NULL
  );
$$;

-- Section checks must also require a fully active/bound admin session.
CREATE OR REPLACE FUNCTION public.current_admin_has_section_access(_section_key text, _require_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_admin_session()
  AND (
    EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.id = public.current_admin_id_from_header()
        AND au.is_active = true
        AND au.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.admin_users au
      JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
      JOIN public.admin_sections s ON s.id = asp.section_id
      WHERE au.id = public.current_admin_id_from_header()
        AND au.is_active = true
        AND s.is_active = true
        AND (s.section_key = _section_key OR s.hub_key = _section_key)
        AND asp.can_view = true
        AND (_require_edit IS NOT TRUE OR asp.can_edit = true)
    )
  );
$$;

-- 2) Device request/check are allowed before full session activation, but only with the token
-- returned by a successful admin_authenticate call for that same admin.
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
  v_token_admin_id := public.current_admin_id_from_header();
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
  v_token_admin_id := public.current_admin_id_from_header();
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

-- 3) Owner actions must be bound to the current active owner token; submitted owner IDs are no longer trusted.
CREATE OR REPLACE FUNCTION public.admin_list_pending_devices(_owner_admin_id uuid)
RETURNS TABLE(
  id uuid,
  admin_user_id uuid,
  admin_email text,
  admin_display_name text,
  admin_role text,
  device_fingerprint text,
  device_name text,
  device_info jsonb,
  ip_address text,
  user_agent text,
  status text,
  requested_at timestamp with time zone,
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  last_used_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_admin_id uuid := public.current_admin_id_from_header();
  v_is_owner boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = v_caller_admin_id AND is_active = true AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT public.is_active_admin_session() OR v_caller_admin_id IS NULL OR v_caller_admin_id <> _owner_admin_id OR NOT v_is_owner THEN
    RAISE EXCEPTION 'Access denied: owner only';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.admin_user_id,
    au.email,
    au.display_name,
    au.role::text,
    d.device_fingerprint,
    d.device_name,
    d.device_info,
    d.ip_address::text,
    d.user_agent,
    d.status::text,
    d.requested_at,
    d.approved_at,
    d.rejected_at,
    d.last_used_at
  FROM public.admin_allowed_devices d
  JOIN public.admin_users au ON au.id = d.admin_user_id
  ORDER BY CASE d.status::text WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
           d.requested_at DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_device(_device_id uuid, _owner_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_admin_id uuid := public.current_admin_id_from_header();
  v_is_owner boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = v_caller_admin_id AND is_active = true AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT public.is_active_admin_session() OR v_caller_admin_id IS NULL OR v_caller_admin_id <> _owner_admin_id OR NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can approve devices');
  END IF;

  UPDATE public.admin_allowed_devices
  SET status = 'approved',
      approved_at = now(),
      approved_by = v_caller_admin_id,
      rejected_at = NULL,
      rejected_by = NULL,
      rejection_reason = NULL
  WHERE id = _device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_device(_device_id uuid, _owner_admin_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_admin_id uuid := public.current_admin_id_from_header();
  v_is_owner boolean := false;
  v_current_status text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = v_caller_admin_id AND is_active = true AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT public.is_active_admin_session() OR v_caller_admin_id IS NULL OR v_caller_admin_id <> _owner_admin_id OR NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can revoke devices');
  END IF;

  SELECT status::text INTO v_current_status
  FROM public.admin_allowed_devices
  WHERE id = _device_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;

  UPDATE public.admin_allowed_devices
  SET status = CASE WHEN v_current_status = 'pending' THEN 'rejected'::admin_device_status ELSE 'revoked'::admin_device_status END,
      rejected_at = now(),
      rejected_by = v_caller_admin_id,
      rejection_reason = left(_reason, 500)
  WHERE id = _device_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Legacy component RPC: keep only as owner-token guarded wrapper.
CREATE OR REPLACE FUNCTION public.update_admin_device_status(_device_id uuid, _new_status text, _notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_admin_id uuid := public.current_admin_id_from_header();
  v_is_owner boolean := false;
  v_status public.admin_device_status;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = v_caller_admin_id AND is_active = true AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT public.is_active_admin_session() OR v_caller_admin_id IS NULL OR NOT v_is_owner THEN
    RAISE EXCEPTION 'Only owners can manage device access';
  END IF;

  IF _new_status NOT IN ('pending','approved','blocked','rejected','revoked') THEN
    RAISE EXCEPTION 'Invalid device status';
  END IF;
  v_status := _new_status::public.admin_device_status;

  UPDATE public.admin_allowed_devices
  SET status = v_status,
      notes = left(_notes, 500),
      approved_by = CASE WHEN v_status = 'approved' THEN v_caller_admin_id ELSE approved_by END,
      approved_at = CASE WHEN v_status = 'approved' THEN now() ELSE approved_at END,
      rejected_by = CASE WHEN v_status IN ('blocked','rejected','revoked') THEN v_caller_admin_id ELSE rejected_by END,
      rejected_at = CASE WHEN v_status IN ('blocked','rejected','revoked') THEN now() ELSE rejected_at END
  WHERE id = _device_id;
END;
$$;

-- 4) Recovery helpers: keep pre-login device recovery but do not return credentials for invalid/banned/deleted accounts.
CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  gender text,
  is_host boolean,
  recovery_email text,
  recovery_password text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text := left(coalesce(p_device_id, ''), 160);
BEGIN
  IF v_device_id !~ '^device_[A-Za-z0-9_:-]{6,128}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_url,
    p.gender,
    COALESCE(p.is_host, false) AS is_host,
    ('guest_' || v_device_id || '@meri.local')::text AS recovery_email,
    ('meri_' || v_device_id || '_secure')::text AS recovery_password
  FROM public.profiles p
  WHERE p.device_id = v_device_id
    AND COALESCE(p.is_deleted, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_blocked, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_devices bd
      WHERE bd.device_id = v_device_id
        AND COALESCE(bd.is_active, true) = true
        AND (COALESCE(bd.is_permanent, false) = true OR bd.expires_at IS NULL OR bd.expires_at > now())
    )
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_by_device_id(p_device_id text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, gender text, is_host boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text := left(coalesce(p_device_id, ''), 160);
BEGIN
  IF v_device_id !~ '^device_[A-Za-z0-9_:-]{6,128}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id AS user_id, p.display_name, p.avatar_url, p.gender, COALESCE(p.is_host, false)
  FROM public.profiles p
  WHERE p.device_id = v_device_id
    AND COALESCE(p.is_deleted, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_blocked, false) = false
  LIMIT 1;
END;
$$;

-- Legacy public helpers locked down.
CREATE OR REPLACE FUNCTION public.register_admin_device(
  _device_fingerprint text,
  _device_name text DEFAULT NULL::text,
  _device_info jsonb DEFAULT NULL::jsonb,
  _ip_address text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'register_admin_device is deprecated; use admin_request_device_access';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_device_approved(_user_id uuid, _device_fingerprint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    JOIN public.admin_allowed_devices d ON d.admin_user_id = au.id
    WHERE au.user_id = _user_id
      AND au.is_active = true
      AND d.device_fingerprint = left(coalesce(_device_fingerprint, ''), 256)
      AND d.status = 'approved'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_pending_devices(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_approve_device(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_device(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_admin_device_status(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_admin_device(text, text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_device_approved(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_by_device_id(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_devices(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_device(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_device(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_device_status(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_request_device_access(uuid, text, text, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_check_device_status(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_by_device_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_device_approved(uuid, text) TO authenticated;