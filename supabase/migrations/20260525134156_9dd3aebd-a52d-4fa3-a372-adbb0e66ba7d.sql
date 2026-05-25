-- Pkg339 pass-2: Admin Auth & Access Layer hardening

-- 1) Add brute-force protection and safer input handling to admin login.
CREATE OR REPLACE FUNCTION public.admin_authenticate(_email text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin record;
  v_password_valid boolean := false;
  v_token text;
  v_email text := lower(trim(coalesce(_email, '')));
  v_password text := coalesce(_password, '');
  v_brute jsonb;
  v_dummy text;
BEGIN
  IF v_email = '' OR length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_password = '' OR length(v_password) > 512 THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  -- Existing generic login-attempt guard: 5 failures/15min -> progressive lockout.
  v_brute := public.check_brute_force(v_email, NULL, NULL);
  IF COALESCE((v_brute->>'allowed')::boolean, true) = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Too many failed login attempts. Please try again later.',
      'locked', true,
      'remaining_seconds', COALESCE((v_brute->>'remaining_seconds')::int, 300)
    );
  END IF;

  SELECT id, email, display_name, role, is_active, password_hash, must_change_password
    INTO v_admin
  FROM public.admin_users
  WHERE lower(email) = v_email
    AND is_active = true
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    -- Burn a bcrypt verification to reduce email-existence timing signal.
    v_dummy := extensions.crypt(v_password, '$2a$10$C6UzMDM.H6dfI/f/IKcEeO2MTVSgP0oZAv7vwdV.QhK4hU6xK4VkW');
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_admin.password_hash IS NULL THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  v_password_valid := (v_admin.password_hash = extensions.crypt(v_password, v_admin.password_hash));

  IF NOT v_password_valid THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  PERFORM public.record_login_attempt(v_email, true, NULL, NULL);

  -- Create a fresh server-side session (7 days).
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.admin_sessions (admin_user_id, session_token, expires_at)
  VALUES (v_admin.id, v_token, now() + interval '7 days');

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
    'is_owner', (v_admin.role = 'owner'),
    'session_token', v_token
  );
END;
$$;

COMMENT ON FUNCTION public.admin_authenticate(text, text) IS
  'Pkg339 pass-2: bcrypt-verifies email/password with server-side brute-force lockout, records attempts, and issues a 7-day admin_sessions row + 32-byte hex session_token.';

-- 2) Rate-limit owner Vault PIN reset OTP requests and use stronger OTP entropy.
CREATE OR REPLACE FUNCTION public.admin_pin_request_reset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_owner_email text;
  v_otp text;
  v_otp_hash text;
  v_recent_count int;
  v_bytes bytea;
  v_num bigint;
BEGIN
  SELECT lower(email) INTO v_owner_email
  FROM public.admin_users
  WHERE role = 'owner' AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_owner_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active owner email found');
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.admin_pin_otp
  WHERE email = v_owner_email
    AND created_at > now() - interval '15 minutes';

  IF v_recent_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many reset codes requested. Please wait 15 minutes.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_pin_otp
    WHERE email = v_owner_email
      AND consumed_at IS NULL
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please wait before requesting another reset code.');
  END IF;

  v_bytes := extensions.gen_random_bytes(4);
  v_num := (
    get_byte(v_bytes, 0)::bigint * 16777216 +
    get_byte(v_bytes, 1)::bigint * 65536 +
    get_byte(v_bytes, 2)::bigint * 256 +
    get_byte(v_bytes, 3)::bigint
  );
  v_otp := lpad((v_num % 1000000)::text, 6, '0');
  v_otp_hash := encode(extensions.digest('mlv-pin-otp::' || v_otp, 'sha256'), 'hex');

  UPDATE public.admin_pin_otp
  SET consumed_at = now()
  WHERE email = v_owner_email AND consumed_at IS NULL;

  INSERT INTO public.admin_pin_otp (otp_hash, email, expires_at)
  VALUES (v_otp_hash, v_owner_email, now() + interval '10 minutes');

  RETURN jsonb_build_object('success', true, 'email', v_owner_email, 'otp_plain', v_otp);
END;
$$;

-- 3) Rate-limit Vault PIN OTP confirmation attempts.
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
  v_limit jsonb;
BEGIN
  IF NOT public.is_active_admin_owner_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only an active owner admin session can reset the vault PIN');
  END IF;

  v_owner_id := public.current_admin_id_from_header();
  v_limit := public.check_rate_limit('admin-pin-reset-confirm:' || v_owner_id::text, 'otp_verify', 10, 600);
  IF COALESCE((v_limit->>'allowed')::boolean, true) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many OTP attempts. Please wait before trying again.');
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

REVOKE EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_reset_with_otp(text, text) TO service_role;

-- Keep admin login callable pre-auth; lockout state is enforced inside the function.
GRANT EXECUTE ON FUNCTION public.admin_authenticate(text, text) TO anon, authenticated;
