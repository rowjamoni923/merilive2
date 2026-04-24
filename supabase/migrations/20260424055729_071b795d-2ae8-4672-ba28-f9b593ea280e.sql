-- ============================================================================
-- ADMIN PANEL FULL SEPARATION + DEVICE APPROVAL WORKFLOW
-- ============================================================================

-- 1. Make sure admin_allowed_devices has all needed columns
ALTER TABLE public.admin_allowed_devices 
  ADD COLUMN IF NOT EXISTS requested_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Make sure status enum has 'pending', 'approved', 'rejected', 'revoked'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_device_status') THEN
    CREATE TYPE public.admin_device_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');
  ELSE
    -- Add missing values if enum exists
    BEGIN
      ALTER TYPE public.admin_device_status ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER TYPE public.admin_device_status ADD VALUE IF NOT EXISTS 'revoked';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- 2. Helper function: check if email is owner
CREATE OR REPLACE FUNCTION public.is_owner_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE LOWER(email) = LOWER(_email)
      AND role = 'owner'
      AND is_active = true
  );
$$;

-- 3. Admin authenticate RPC - validates email + password against admin_users (NO link to auth.users)
CREATE OR REPLACE FUNCTION public.admin_authenticate(
  _email text,
  _password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin record;
  v_password_valid boolean := false;
BEGIN
  SELECT id, email, display_name, role, is_active, password_hash, must_change_password
    INTO v_admin
  FROM public.admin_users
  WHERE LOWER(email) = LOWER(_email)
    AND is_active = true
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_admin.password_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password not set. Contact owner.');
  END IF;

  -- Verify password using crypt
  v_password_valid := (v_admin.password_hash = extensions.crypt(_password, v_admin.password_hash));

  IF NOT v_password_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  -- Update last login
  UPDATE public.admin_users
  SET last_login_at = now()
  WHERE id = v_admin.id;

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name,
    'role', v_admin.role,
    'must_change_password', COALESCE(v_admin.must_change_password, false),
    'is_owner', (v_admin.role = 'owner')
  );
END;
$$;

-- 4. Request device access (sub-admin first login from new device)
CREATE OR REPLACE FUNCTION public.admin_request_device_access(
  _admin_id uuid,
  _device_fingerprint text,
  _device_name text DEFAULT NULL,
  _device_info jsonb DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL
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
BEGIN
  SELECT id, email, role, is_active INTO v_admin
  FROM public.admin_users
  WHERE id = _admin_id AND is_active = true
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;

  -- OWNERS bypass device approval entirely
  IF v_admin.role = 'owner' THEN
    -- Auto-approve owner devices for tracking
    INSERT INTO public.admin_allowed_devices (
      admin_user_id, device_fingerprint, device_name, device_info,
      ip_address, user_agent, status, approved_at, approved_by, last_used_at
    ) VALUES (
      _admin_id, _device_fingerprint, _device_name, _device_info,
      _ip_address, _user_agent, 'approved', now(), _admin_id, now()
    )
    ON CONFLICT (admin_user_id, device_fingerprint) DO UPDATE
      SET last_used_at = now(),
          status = 'approved',
          ip_address = COALESCE(EXCLUDED.ip_address, admin_allowed_devices.ip_address);

    RETURN jsonb_build_object('success', true, 'status', 'approved', 'is_owner', true);
  END IF;

  -- SUB-ADMIN: Check existing device
  SELECT id, status INTO v_device
  FROM public.admin_allowed_devices
  WHERE admin_user_id = _admin_id AND device_fingerprint = _device_fingerprint
  LIMIT 1;

  IF v_device.id IS NOT NULL THEN
    IF v_device.status = 'approved' THEN
      UPDATE public.admin_allowed_devices
      SET last_used_at = now()
      WHERE id = v_device.id;
      RETURN jsonb_build_object('success', true, 'status', 'approved', 'device_id', v_device.id);
    ELSIF v_device.status = 'rejected' THEN
      RETURN jsonb_build_object('success', false, 'status', 'rejected', 'error', 'Device access rejected by owner');
    ELSIF v_device.status = 'revoked' THEN
      -- Re-request approval after revocation
      UPDATE public.admin_allowed_devices
      SET status = 'pending', requested_at = now(),
          ip_address = COALESCE(_ip_address, ip_address),
          user_agent = COALESCE(_user_agent, user_agent)
      WHERE id = v_device.id;
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device.id);
    ELSE
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device.id);
    END IF;
  END IF;

  -- New device → create pending request
  INSERT INTO public.admin_allowed_devices (
    admin_user_id, device_fingerprint, device_name, device_info,
    ip_address, user_agent, status, requested_at
  ) VALUES (
    _admin_id, _device_fingerprint, _device_name, _device_info,
    _ip_address, _user_agent, 'pending', now()
  )
  RETURNING id INTO v_device_id;

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'device_id', v_device_id);
END;
$$;

-- 5. Check device status (called periodically by sub-admin waiting screen)
CREATE OR REPLACE FUNCTION public.admin_check_device_status(
  _admin_id uuid,
  _device_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role text;
  v_device record;
BEGIN
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
  WHERE admin_user_id = _admin_id AND device_fingerprint = _device_fingerprint
  LIMIT 1;

  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'status', v_device.status::text,
    'device_id', v_device.id,
    'rejection_reason', v_device.rejection_reason
  );
END;
$$;

-- 6. Owner approves a device
CREATE OR REPLACE FUNCTION public.admin_approve_device(
  _device_id uuid,
  _owner_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_role text;
BEGIN
  SELECT role INTO v_owner_role
  FROM public.admin_users
  WHERE id = _owner_admin_id AND is_active = true AND role = 'owner'
  LIMIT 1;

  IF v_owner_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can approve devices');
  END IF;

  UPDATE public.admin_allowed_devices
  SET status = 'approved',
      approved_at = now(),
      approved_by = _owner_admin_id,
      rejected_at = NULL,
      rejection_reason = NULL
  WHERE id = _device_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. Owner rejects/revokes a device
CREATE OR REPLACE FUNCTION public.admin_revoke_device(
  _device_id uuid,
  _owner_admin_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_role text;
  v_current_status text;
BEGIN
  SELECT role INTO v_owner_role
  FROM public.admin_users
  WHERE id = _owner_admin_id AND is_active = true AND role = 'owner'
  LIMIT 1;

  IF v_owner_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can revoke devices');
  END IF;

  SELECT status::text INTO v_current_status
  FROM public.admin_allowed_devices
  WHERE id = _device_id;

  UPDATE public.admin_allowed_devices
  SET status = CASE WHEN v_current_status = 'pending' THEN 'rejected'::admin_device_status ELSE 'revoked'::admin_device_status END,
      rejected_at = now(),
      rejected_by = _owner_admin_id,
      rejection_reason = _reason
  WHERE id = _device_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. List all pending device requests (owner only)
CREATE OR REPLACE FUNCTION public.admin_list_pending_devices(_owner_admin_id uuid)
RETURNS TABLE (
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
  requested_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  last_used_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_role text;
BEGIN
  SELECT role INTO v_owner_role
  FROM public.admin_users
  WHERE id = _owner_admin_id AND is_active = true AND role = 'owner'
  LIMIT 1;

  IF v_owner_role IS NULL THEN
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
  ORDER BY 
    CASE d.status::text WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
    d.requested_at DESC NULLS LAST;
END;
$$;

-- 9. Unique constraint to prevent duplicate device entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admin_allowed_devices_user_fp_unique'
  ) THEN
    ALTER TABLE public.admin_allowed_devices
    ADD CONSTRAINT admin_allowed_devices_user_fp_unique 
    UNIQUE (admin_user_id, device_fingerprint);
  END IF;
END $$;

-- 10. Enable realtime for device approval notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_allowed_devices;

-- 11. Grant execute permissions to anon (since admin login does not use auth.users)
GRANT EXECUTE ON FUNCTION public.admin_authenticate(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_request_device_access(uuid, text, text, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_check_device_status(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_device(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_device(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_devices(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_email(text) TO anon, authenticated;