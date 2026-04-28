-- Package verification hardening: bind owner-only RPCs to the active admin session token.

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
  v_session_admin_id := public.current_admin_id();

  IF v_session_admin_id IS NULL OR v_session_admin_id <> _admin_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active admin session required');
  END IF;

  SELECT role, is_active
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
  v_session_admin_id := public.current_admin_id();

  IF v_session_admin_id IS NULL OR v_session_admin_id <> _admin_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active admin session required');
  END IF;

  SELECT role, is_active
  INTO v_role, v_active
  FROM public.admin_users
  WHERE id = v_session_admin_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;

  IF v_role <> 'owner' OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active owners can set the vault PIN');
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

GRANT EXECUTE ON FUNCTION public.admin_rotate_secret_token(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_set(uuid, text, text) TO anon, authenticated;