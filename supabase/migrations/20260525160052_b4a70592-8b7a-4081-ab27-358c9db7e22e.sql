CREATE TABLE IF NOT EXISTS public.admin_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL UNIQUE,
  role public.admin_role NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_login_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_login_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_login_challenges TO service_role;

CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_challenge
  ON public.admin_login_challenges (challenge)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.admin_authenticate(_email text, _password text, _link_challenge text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_admin record;
  v_password_valid boolean := false;
  v_token text;
  v_email text := lower(trim(coalesce(_email, '')));
  v_password text := coalesce(_password, '');
  v_brute jsonb;
  v_dummy text;
  v_challenge text := trim(coalesce(_link_challenge, ''));
  v_challenge_row record;
BEGIN
  IF v_email = '' OR length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_password = '' OR length(v_password) > 512 THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_challenge = '' OR length(v_challenge) < 32 OR length(v_challenge) > 256 THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Secret link verification required');
  END IF;

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
    v_dummy := extensions.crypt(v_password, '$2a$10$C6UzMDM.H6dfI/f/IKcEeO2MTVSgP0oZAv7vwdV.QhK4hU6xK4VkW');
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  SELECT id, role
    INTO v_challenge_row
  FROM public.admin_login_challenges
  WHERE challenge = v_challenge
    AND consumed_at IS NULL
    AND expires_at > now()
  LIMIT 1
  FOR UPDATE;

  IF v_challenge_row.id IS NULL THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'Secret link verification expired. Please reopen the secret link.');
  END IF;

  IF v_challenge_row.role IS DISTINCT FROM v_admin.role THEN
    PERFORM public.record_login_attempt(v_email, false, NULL, NULL);
    RETURN jsonb_build_object('success', false, 'error', 'This secret link is not valid for this admin account');
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

  UPDATE public.admin_login_challenges
  SET consumed_at = now(), consumed_by = v_admin.id
  WHERE id = v_challenge_row.id;

  PERFORM public.record_login_attempt(v_email, true, NULL, NULL);

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
$function$;

REVOKE ALL ON FUNCTION public.admin_authenticate(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_authenticate(text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.admin_authenticate(text, text, text) IS 'Authenticates admin credentials only when accompanied by a fresh secret-link challenge issued by validate-admin-token. Sessions last 7 days.';