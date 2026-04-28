-- Admin token overrides: owner-rotated secret links
-- Stores manually generated tokens that override year-derived defaults.

CREATE TABLE IF NOT EXISTS public.admin_token_overrides (
  kind text PRIMARY KEY CHECK (kind IN ('owner', 'sub_admin')),
  token text NOT NULL,
  rotated_by uuid,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  rotated_year int NOT NULL DEFAULT extract(year from now())::int
);

ALTER TABLE public.admin_token_overrides ENABLE ROW LEVEL SECURITY;

-- Only active admin sessions (owner) can read/write — sub-admins blocked at RPC level
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_token_overrides;
CREATE POLICY "Admin session full access"
  ON public.admin_token_overrides
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Owner-only rotation RPC
CREATE OR REPLACE FUNCTION public.admin_rotate_secret_token(_admin_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_active boolean;
  v_suffix text;
  v_year int := extract(year from now())::int;
  v_token text;
  v_prefix text;
BEGIN
  -- Verify caller is an active owner
  SELECT role, is_active INTO v_role, v_active
    FROM public.admin_users WHERE id = _admin_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found');
  END IF;
  IF v_role <> 'owner' OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active owners can rotate secret links');
  END IF;

  IF _kind NOT IN ('owner', 'sub_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid kind');
  END IF;

  -- Random 8-hex suffix
  v_suffix := substr(encode(gen_random_bytes(8), 'hex'), 1, 8);

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

GRANT EXECUTE ON FUNCTION public.admin_rotate_secret_token(uuid, text) TO anon, authenticated;