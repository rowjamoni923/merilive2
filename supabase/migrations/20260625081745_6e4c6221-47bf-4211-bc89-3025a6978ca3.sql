CREATE OR REPLACE FUNCTION public.generate_group_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.groups g WHERE g.group_code = v_code
    );
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_group_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_group_code() TO authenticated, service_role;

ALTER TABLE public.groups
  ALTER COLUMN group_code SET DEFAULT public.generate_group_code();

CREATE OR REPLACE FUNCTION public.create_chat_group(
  p_name text,
  p_group_type text DEFAULT 'basic'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_type text := lower(coalesce(nullif(btrim(p_group_type), ''), 'basic'));
  v_group_id uuid;
  v_group_code text;
  v_banned boolean := false;
  v_basic_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 80 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_group_name');
  END IF;

  IF v_type NOT IN ('basic', 'family') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_group_type');
  END IF;

  SELECT COALESCE(is_banned, false) OR COALESCE(is_deleted, false)
    INTO v_banned
  FROM public.profiles
  WHERE id = v_uid OR user_id = v_uid
  LIMIT 1;

  IF COALESCE(v_banned, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_blocked');
  END IF;

  IF v_type = 'family' THEN
    IF EXISTS (
      SELECT 1
      FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
      WHERE gm.user_id = v_uid
        AND g.group_type = 'family'
        AND COALESCE(g.is_active, true) = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'family_limit_reached');
    END IF;
  ELSE
    SELECT count(*)::integer
      INTO v_basic_count
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_uid
      AND g.group_type = 'basic'
      AND COALESCE(g.is_active, true) = true;

    IF COALESCE(v_basic_count, 0) >= 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'basic_limit_reached');
    END IF;
  END IF;

  INSERT INTO public.groups (
    name,
    group_type,
    group_code,
    owner_id,
    created_by,
    member_count,
    is_active
  ) VALUES (
    v_name,
    v_type,
    public.generate_group_code(),
    v_uid,
    v_uid,
    0,
    true
  )
  RETURNING id, group_code INTO v_group_id, v_group_code;

  INSERT INTO public.group_members (
    group_id,
    user_id,
    role
  ) VALUES (
    v_group_id,
    v_uid,
    'owner'
  );

  RETURN jsonb_build_object(
    'success', true,
    'group_id', v_group_id,
    'group_code', v_group_code
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_group_or_member');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_ready');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_chat_group(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_chat_group(text, text) TO authenticated;