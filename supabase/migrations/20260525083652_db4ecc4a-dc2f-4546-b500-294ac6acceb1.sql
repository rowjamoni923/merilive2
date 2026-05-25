-- DM/Chat group schema compatibility repair (retry: drop legacy broken function first)

DROP FUNCTION IF EXISTS public.search_group_by_code(text);

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS group_type text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS group_code text,
  ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 0;

UPDATE public.groups
SET owner_id = COALESCE(owner_id, created_by),
    group_type = COALESCE(NULLIF(group_type, ''), 'basic'),
    group_code = COALESCE(group_code, upper(substr(md5(id::text || random()::text), 1, 8))),
    member_count = COALESCE((SELECT count(*)::int FROM public.group_members gm WHERE gm.group_id = groups.id), member_count, 0);

ALTER TABLE public.groups
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN group_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'groups_group_type_check'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_group_type_check CHECK (group_type IN ('basic', 'family'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'groups_group_code_key'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_group_code_key UNIQUE (group_code);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_groups_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, NEW.owner_id, auth.uid());
    NEW.owner_id := COALESCE(NEW.owner_id, NEW.created_by, auth.uid());

    IF NEW.created_by IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Group creator mismatch';
    END IF;

    IF NEW.created_by IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
      RAISE EXCEPTION 'Cannot create group for another user';
    END IF;

    NEW.group_type := COALESCE(NULLIF(NEW.group_type, ''), 'basic');
    IF NEW.group_type NOT IN ('basic', 'family') THEN
      RAISE EXCEPTION 'Invalid group type';
    END IF;

    NEW.group_code := COALESCE(NULLIF(NEW.group_code, ''), upper(substr(md5(gen_random_uuid()::text), 1, 8)));
    NEW.member_count := GREATEST(COALESCE(NEW.member_count, 0), 0);
    NEW.is_active := COALESCE(NEW.is_active, true);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.group_code IS DISTINCT FROM OLD.group_code
       OR NEW.member_count IS DISTINCT FROM OLD.member_count THEN
      IF NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
        RAISE EXCEPTION 'Protected group fields cannot be changed';
      END IF;
    END IF;

    NEW.group_type := COALESCE(NULLIF(NEW.group_type, ''), OLD.group_type, 'basic');
    IF NEW.group_type NOT IN ('basic', 'family') THEN
      RAISE EXCEPTION 'Invalid group type';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_groups_write ON public.groups;
CREATE TRIGGER tg_guard_groups_write
BEFORE INSERT OR UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.guard_groups_write();

CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.groups
    SET member_count = (SELECT count(*)::int FROM public.group_members WHERE group_id = NEW.group_id)
    WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups
    SET member_count = (SELECT count(*)::int FROM public.group_members WHERE group_id = OLD.group_id)
    WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_group_by_code(_group_code text)
RETURNS TABLE(id uuid, name text, avatar_url text, member_count integer, group_type text, group_code text, owner_name text, owner_avatar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.name,
    g.avatar_url,
    g.member_count,
    g.group_type,
    g.group_code,
    p.display_name AS owner_name,
    p.avatar_url AS owner_avatar
  FROM public.groups g
  LEFT JOIN public.profiles_public p ON p.id = g.owner_id
  WHERE g.group_code ILIKE '%' || btrim(_group_code) || '%'
    AND COALESCE(g.is_active, true) = true
  ORDER BY CASE WHEN lower(g.group_code) = lower(btrim(_group_code)) THEN 0 ELSE 1 END, g.created_at DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.search_group_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_group_by_code(text) TO authenticated;

DROP POLICY IF EXISTS "groups_create_self" ON public.groups;
CREATE POLICY "groups_create_self"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = COALESCE(created_by, owner_id));

DROP POLICY IF EXISTS "groups_creator_update" ON public.groups;
CREATE POLICY "groups_creator_update"
ON public.groups
FOR UPDATE
TO authenticated
USING (
  auth.uid() = COALESCE(created_by, owner_id)
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
)
WITH CHECK (
  auth.uid() = COALESCE(created_by, owner_id)
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

DROP POLICY IF EXISTS "group_members_leave_or_creator_remove" ON public.group_members;
CREATE POLICY "group_members_leave_or_creator_remove"
ON public.group_members
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id
      AND COALESCE(g.created_by, g.owner_id) = auth.uid()
  )
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);