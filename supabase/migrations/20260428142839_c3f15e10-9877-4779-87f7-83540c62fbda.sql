CREATE OR REPLACE FUNCTION public.admin_rotate_secret_token(p_token_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_owner boolean;
  v_new_token text;
  v_year int := EXTRACT(YEAR FROM now())::int;
BEGIN
  -- Resolve current admin session
  v_admin_id := public.current_admin_id();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as admin';
  END IF;

  -- Owner-only
  SELECT (role = 'owner' AND is_active = true)
  INTO v_is_owner
  FROM public.admin_users
  WHERE id = v_admin_id;

  IF v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Only active owners can rotate secret tokens';
  END IF;

  IF p_token_kind NOT IN ('owner', 'sub_admin') THEN
    RAISE EXCEPTION 'Invalid token kind: %', p_token_kind;
  END IF;

  -- Generate 32-char hex token using built-in random (no pgcrypto needed)
  v_new_token := lower(
    lpad(to_hex((random() * 4294967295)::bigint), 8, '0') ||
    lpad(to_hex((random() * 4294967295)::bigint), 8, '0') ||
    lpad(to_hex((random() * 4294967295)::bigint), 8, '0') ||
    lpad(to_hex((random() * 4294967295)::bigint), 8, '0')
  );

  -- Upsert override
  INSERT INTO public.admin_token_overrides (token_kind, year, token, rotated_by, rotated_at)
  VALUES (p_token_kind, v_year, v_new_token, v_admin_id, now())
  ON CONFLICT (token_kind, year)
  DO UPDATE SET
    token = EXCLUDED.token,
    rotated_by = EXCLUDED.rotated_by,
    rotated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'token_kind', p_token_kind,
    'token', v_new_token,
    'rotated_at', now()
  );
END;
$$;