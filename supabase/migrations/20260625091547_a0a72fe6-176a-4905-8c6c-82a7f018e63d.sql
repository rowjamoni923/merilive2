-- Fix professional group creation response + member count drift

-- 1) Remove duplicate/old member-count triggers so inserts do not double-count.
DROP TRIGGER IF EXISTS group_members_count_ins ON public.group_members;
DROP TRIGGER IF EXISTS group_members_count_del ON public.group_members;
DROP TRIGGER IF EXISTS trg_group_members_count ON public.group_members;

-- 2) Allow only the trusted counter trigger to update member_count.
CREATE OR REPLACE FUNCTION public.tg_guard_groups_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_counter_update boolean := COALESCE(current_setting('app.group_counter_update', true), '') = 'on';
BEGIN
  -- Internal member-count maintenance only. No client should be able to use this path.
  IF v_counter_update THEN
    IF NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.max_members IS NOT DISTINCT FROM OLD.max_members
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
       AND NEW.group_type IS NOT DISTINCT FROM OLD.group_type
       AND NEW.group_code IS NOT DISTINCT FROM OLD.group_code
       AND NEW.invite_token IS NOT DISTINCT FROM OLD.invite_token
       AND NEW.invite_expires_at IS NOT DISTINCT FROM OLD.invite_expires_at
       AND NEW.invite_max_uses IS NOT DISTINCT FROM OLD.invite_max_uses
       AND NEW.invite_used_count IS NOT DISTINCT FROM OLD.invite_used_count
       AND NEW.settings IS NOT DISTINCT FROM OLD.settings
       AND NEW.is_public IS NOT DISTINCT FROM OLD.is_public
       AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'invalid_counter_update';
  END IF;

  IF v_role = 'service_role' OR public.is_active_admin_session() OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- creator/owner can only edit presentation/settings fields; protected system fields stay server-controlled.
  NEW.id := OLD.id;
  NEW.group_type := OLD.group_type;
  NEW.owner_id := OLD.owner_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.member_count := OLD.member_count;
  NEW.group_code := OLD.group_code;
  IF NEW.max_members IS DISTINCT FROM OLD.max_members THEN NEW.max_members := OLD.max_members; END IF;

  IF char_length(coalesce(NEW.name,'')) < 1 OR char_length(NEW.name) > 80 THEN
    RAISE EXCEPTION 'invalid_group_name';
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Recount from source-of-truth instead of +/- math to avoid drift forever.
CREATE OR REPLACE FUNCTION public.tg_group_members_recount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid := COALESCE(NEW.group_id, OLD.group_id);
BEGIN
  PERFORM set_config('app.group_counter_update', 'on', true);

  UPDATE public.groups g
  SET member_count = (
    SELECT count(*)::integer
    FROM public.group_members gm
    WHERE gm.group_id = v_group_id
  )
  WHERE g.id = v_group_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_group_members_recount
AFTER INSERT OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.tg_group_members_recount();

-- 4) Rebuild create_chat_group to return the object the app already expects.
DROP FUNCTION IF EXISTS public.create_chat_group(text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.create_chat_group(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_chat_group(text, text, text);
DROP FUNCTION IF EXISTS public.create_chat_group(text, text);

CREATE FUNCTION public.create_chat_group(
  p_name text,
  p_group_type text DEFAULT 'basic',
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_is_public boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_group_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  p_name := btrim(COALESCE(p_name, ''));
  IF char_length(p_name) < 1 OR char_length(p_name) > 80 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_group_name');
  END IF;

  p_group_type := COALESCE(NULLIF(btrim(p_group_type), ''), 'basic');
  IF p_group_type NOT IN ('basic','family','public') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_group_type');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_ready');
  END IF;

  IF p_group_type = 'family' AND EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_uid
      AND g.group_type = 'family'
      AND COALESCE(g.is_active, true) = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'family_limit_reached');
  END IF;

  IF p_group_type = 'basic' AND (
    SELECT count(*)
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_uid
      AND g.group_type = 'basic'
      AND COALESCE(g.is_active, true) = true
  ) >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'basic_limit_reached');
  END IF;

  INSERT INTO public.groups(name, description, avatar_url, created_by, owner_id, group_type, is_public, invite_token)
  VALUES (
    p_name,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_avatar_url, '')), ''),
    v_uid,
    v_uid,
    p_group_type,
    COALESCE(p_is_public, false) AND p_group_type <> 'family',
    encode(extensions.gen_random_bytes(12), 'hex')
  )
  RETURNING id, group_code INTO v_group_id, v_group_code;

  INSERT INTO public.group_members(group_id, user_id, role)
  VALUES (v_group_id, v_uid, 'owner');

  RETURN jsonb_build_object(
    'success', true,
    'group_id', v_group_id,
    'group_code', v_group_code
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_group_or_member');
  WHEN others THEN
    IF SQLERRM ILIKE '%family%' THEN
      RETURN jsonb_build_object('success', false, 'error', 'family_limit_reached');
    ELSIF SQLERRM ILIKE '%basic_limit%' THEN
      RETURN jsonb_build_object('success', false, 'error', 'basic_limit_reached');
    ELSIF SQLERRM ILIKE '%invalid_group_name%' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_group_name');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_chat_group(text, text, text, text, boolean) TO authenticated;

-- 5) Repair existing counts from current memberships.
SELECT set_config('app.group_counter_update', 'on', true);
UPDATE public.groups g
SET member_count = COALESCE(c.member_count, 0)
FROM (
  SELECT g2.id, count(gm.id)::integer AS member_count
  FROM public.groups g2
  LEFT JOIN public.group_members gm ON gm.group_id = g2.id
  GROUP BY g2.id
) c
WHERE c.id = g.id;
SELECT set_config('app.group_counter_update', '', true);