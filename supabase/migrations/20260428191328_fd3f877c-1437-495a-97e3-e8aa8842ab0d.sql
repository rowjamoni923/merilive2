-- Fix Admin Owner Secret Link + Vault PIN runtime errors

-- Ensure pgcrypto is available for digest/gen_random_bytes through the extensions schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate the owner-only token rotation RPC using the actual admin_token_overrides schema.
CREATE OR REPLACE FUNCTION public.admin_rotate_secret_token(_admin_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
  v_active boolean;
  v_suffix text;
  v_year int := extract(year from now())::int;
  v_token text;
  v_prefix text;
BEGIN
  SELECT role, is_active
  INTO v_role, v_active
  FROM public.admin_users
  WHERE id = _admin_id;

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
  VALUES (_kind, v_token, _admin_id, now(), v_year)
  ON CONFLICT (kind) DO UPDATE
  SET token = EXCLUDED.token,
      rotated_by = EXCLUDED.rotated_by,
      rotated_at = EXCLUDED.rotated_at,
      rotated_year = EXCLUDED.rotated_year;

  RETURN jsonb_build_object('success', true, 'token', v_token, 'kind', _kind, 'rotated_at', now());
END;
$$;

-- Remove the incompatible one-argument overload from the previous hotfix if it exists.
DROP FUNCTION IF EXISTS public.admin_rotate_secret_token(text);

GRANT EXECUTE ON FUNCTION public.admin_rotate_secret_token(uuid, text) TO anon, authenticated;

-- Fix Vault PIN save: Supabase REST protections reject DELETE without WHERE in RPC-generated statements.
-- Use TRUNCATE inside the SECURITY DEFINER owner-only RPC to clear trusted devices after PIN changes.
CREATE OR REPLACE FUNCTION public.admin_pin_set(_admin_id uuid, _new_pin text, _current_pin text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
  v_active boolean;
  v_existing_hash text;
BEGIN
  SELECT role, is_active
  INTO v_role, v_active
  FROM public.admin_users
  WHERE id = _admin_id;

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
  VALUES (true, public.hash_admin_pin(_new_pin), _admin_id, now(), 0, NULL)
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

-- Fix Vault PIN OTP reset with the same trusted-device clearing strategy.
CREATE OR REPLACE FUNCTION public.admin_pin_reset_with_otp(_otp text, _new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_otp_hash text;
  v_row public.admin_pin_otp%ROWTYPE;
BEGIN
  IF _new_pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 6 digits');
  END IF;

  IF _otp IS NULL OR _otp !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP must be 6 digits');
  END IF;

  v_otp_hash := encode(extensions.digest('mlv-pin-otp::' || _otp, 'sha256'), 'hex');

  SELECT *
  INTO v_row
  FROM public.admin_pin_otp
  WHERE otp_hash = v_otp_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP invalid or expired');
  END IF;

  UPDATE public.admin_pin_otp
  SET consumed_at = now()
  WHERE id = v_row.id;

  INSERT INTO public.admin_security_pin (id, pin_hash, set_at, failed_attempts, locked_until)
  VALUES (true, public.hash_admin_pin(_new_pin), now(), 0, NULL)
  ON CONFLICT (id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      set_at = now(),
      failed_attempts = 0,
      locked_until = NULL;

  TRUNCATE TABLE public.admin_pin_trusted_devices;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pin_set(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) TO anon, authenticated;