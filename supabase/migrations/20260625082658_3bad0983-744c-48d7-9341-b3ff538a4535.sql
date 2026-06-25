CREATE OR REPLACE FUNCTION public.tg_guard_group_members_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_grp public.groups%ROWTYPE;
  v_cnt int;
  v_banned boolean := false;
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = NEW.group_id
        AND gm.user_id = v_uid
        AND gm.role IN ('owner','admin')
    ) THEN
      RAISE EXCEPTION 'cannot_add_others';
    END IF;
  END IF;

  SELECT * INTO v_grp
  FROM public.groups
  WHERE id = NEW.group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF COALESCE(v_grp.is_active, true) = false THEN
    RAISE EXCEPTION 'group_inactive';
  END IF;

  SELECT COALESCE(p.is_banned, false) OR COALESCE(p.is_deleted, false)
    INTO v_banned
  FROM public.profiles p
  WHERE p.id = NEW.user_id
  LIMIT 1;

  IF COALESCE(v_banned, false) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;

  IF NEW.user_id = v_uid AND NEW.role IS DISTINCT FROM 'member' THEN
    IF NEW.role = 'owner' THEN
      IF v_grp.owner_id <> v_uid THEN
        RAISE EXCEPTION 'not_owner';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.group_members
        WHERE group_id = NEW.group_id
          AND role = 'owner'
      ) THEN
        RAISE EXCEPTION 'owner_already_exists';
      END IF;
    ELSE
      NEW.role := 'member';
    END IF;
  END IF;

  SELECT count(*) INTO v_cnt
  FROM public.group_members
  WHERE group_id = NEW.group_id;

  IF v_cnt >= COALESCE(v_grp.max_members, 500) THEN
    RAISE EXCEPTION 'group_full';
  END IF;

  IF v_grp.group_type = 'family' THEN
    IF EXISTS (
      SELECT 1
      FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
      WHERE gm.user_id = NEW.user_id
        AND g.group_type = 'family'
        AND COALESCE(g.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'family_limit_reached';
    END IF;
  ELSIF v_grp.group_type = 'basic' THEN
    SELECT count(*) INTO v_cnt
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = NEW.user_id
      AND g.group_type = 'basic'
      AND COALESCE(g.is_active, true) = true;

    IF v_cnt >= 20 THEN
      RAISE EXCEPTION 'basic_limit_reached';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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

  SELECT COALESCE(p.is_banned, false) OR COALESCE(p.is_deleted, false)
    INTO v_banned
  FROM public.profiles p
  WHERE p.id = v_uid
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