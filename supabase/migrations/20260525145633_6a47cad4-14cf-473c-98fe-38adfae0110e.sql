-- Pkg340 pass-4: remove legacy auth.uid fallback from effective admin helpers.
-- Admin/owner authority must come only from the dedicated x-admin-token session
-- bound to an approved admin device.

CREATE OR REPLACE FUNCTION public.current_effective_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_admin_id_from_header();
$$;

CREATE OR REPLACE FUNCTION public.current_effective_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.admin_users
  WHERE id = public.current_effective_admin_id()
    AND is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_effective_admin_id() IS
'Pkg340 pass-4: dedicated admin authority only; legacy auth.uid() fallback removed so user-app sessions cannot bypass admin session/device approval.';

COMMENT ON FUNCTION public.current_effective_admin_role() IS
'Pkg340 pass-4: role is derived only from current_effective_admin_id(), which is x-admin-token and approved-device bound.';

CREATE OR REPLACE FUNCTION public.admin_rotate_secret_token(_admin_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session_admin_id uuid;
  v_role text;
  v_active boolean;
  v_suffix text;
  v_year int := extract(year from now())::int;
  v_token text;
  v_prefix text;
BEGIN
  v_session_admin_id := public.current_admin_id_from_header();

  IF v_session_admin_id IS NULL OR v_session_admin_id IS DISTINCT FROM _admin_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active approved owner admin session required');
  END IF;

  SELECT role::text, is_active
  INTO v_role, v_active
  FROM public.admin_users
  WHERE id = v_session_admin_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;

  IF v_role <> 'owner' OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active owners can rotate secret links');
  END IF;

  IF _kind NOT IN ('owner', 'sub_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid kind');
  END IF;

  v_suffix := substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8);

  IF _kind = 'owner' THEN
    v_prefix := 'gala-royal-velvet-' || v_year || '-aurora-';
  ELSE
    v_prefix := 'gala-noir-onyx-' || v_year || '-prism-';
  END IF;

  v_token := v_prefix || v_suffix;

  INSERT INTO public.admin_token_overrides (kind, token, rotated_by, rotated_at, rotated_year)
  VALUES (_kind, v_token, v_session_admin_id, now(), v_year)
  ON CONFLICT (kind) DO UPDATE
  SET token = EXCLUDED.token,
      rotated_by = EXCLUDED.rotated_by,
      rotated_at = EXCLUDED.rotated_at,
      rotated_year = EXCLUDED.rotated_year;

  RETURN jsonb_build_object('success', true, 'token', v_token, 'kind', _kind, 'rotated_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_set(_admin_id uuid, _new_pin text, _current_pin text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session_admin_id uuid;
  v_role text;
  v_active boolean;
  v_existing_hash text;
BEGIN
  v_session_admin_id := public.current_admin_id_from_header();

  IF v_session_admin_id IS NULL OR v_session_admin_id IS DISTINCT FROM _admin_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active approved owner admin session required');
  END IF;

  SELECT role::text, is_active
  INTO v_role, v_active
  FROM public.admin_users
  WHERE id = v_session_admin_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;

  IF v_role <> 'owner' OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active owners can set the vault PIN');
  END IF;

  IF _new_pin IS NULL OR _new_pin !~ '^[0-9]{6}$' THEN
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
  VALUES (true, public.hash_admin_pin(_new_pin), v_session_admin_id, now(), 0, NULL)
  ON CONFLICT (id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      set_by = EXCLUDED.set_by,
      set_at = EXCLUDED.set_at,
      failed_attempts = 0,
      locked_until = NULL;

  TRUNCATE TABLE public.admin_pin_trusted_devices;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.current_effective_admin_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_effective_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_rotate_secret_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_pin_set(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_effective_admin_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_effective_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rotate_secret_token(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pin_set(uuid, text, text) TO anon, authenticated, service_role;