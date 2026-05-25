-- DM/Chat group hardening + realtime restoration

-- Helper: check group membership without recursive RLS issues.
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.group_id = _group_id
      AND gm.user_id = _user_id
      AND COALESCE(g.is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;

-- Tighten group RLS policies.
DROP POLICY IF EXISTS "a_read_grp_mem" ON public.group_members;
DROP POLICY IF EXISTS "group_members_select_policy" ON public.group_members;
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
CREATE POLICY "group_members_read_own_groups"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  public.is_group_member(group_id, auth.uid())
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

DROP POLICY IF EXISTS "a_ins_grp_mem" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_policy" ON public.group_members;
CREATE POLICY "group_members_join_active_groups"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role = 'member'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_id
      AND COALESCE(g.is_active, true) = true
  )
);

DROP POLICY IF EXISTS "a_del_grp_mem" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_policy" ON public.group_members;
CREATE POLICY "group_members_leave_or_creator_remove"
ON public.group_members
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
  )
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

DROP POLICY IF EXISTS "a_read_grp_msg" ON public.group_messages;
DROP POLICY IF EXISTS "Members can view group messages" ON public.group_messages;
CREATE POLICY "group_messages_read_members_only"
ON public.group_messages
FOR SELECT
TO authenticated
USING (
  public.is_group_member(group_id, auth.uid())
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

DROP POLICY IF EXISTS "a_ins_grp_msg" ON public.group_messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages;
CREATE POLICY "group_messages_send_members_only"
ON public.group_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_group_member(group_id, auth.uid())
);

DROP POLICY IF EXISTS "group_messages_no_client_update" ON public.group_messages;
CREATE POLICY "group_messages_no_client_update"
ON public.group_messages
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "group_messages_no_client_delete" ON public.group_messages;
CREATE POLICY "group_messages_no_client_delete"
ON public.group_messages
FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "a_read_groups" ON public.groups;
DROP POLICY IF EXISTS "Anyone can view active groups" ON public.groups;
CREATE POLICY "groups_read_active_or_member"
ON public.groups
FOR SELECT
TO authenticated
USING (
  COALESCE(is_active, true) = true
  OR public.is_group_member(id, auth.uid())
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

DROP POLICY IF EXISTS "a_ins_groups" ON public.groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
CREATE POLICY "groups_create_self"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "a_upd_groups" ON public.groups;
DROP POLICY IF EXISTS "Owners can update their groups" ON public.groups;
CREATE POLICY "groups_creator_update"
ON public.groups
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
)
WITH CHECK (
  auth.uid() = created_by
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

-- Integrity guards.
CREATE OR REPLACE FUNCTION public.guard_group_members_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
      RAISE EXCEPTION 'Cannot add another user to a group';
    END IF;

    IF NEW.role IS NULL THEN
      NEW.role := 'member';
    END IF;

    IF NEW.role NOT IN ('owner', 'admin', 'member') THEN
      RAISE EXCEPTION 'Invalid group role';
    END IF;

    IF NEW.role <> 'member' AND NOT EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = NEW.group_id AND g.created_by = auth.uid()
    ) AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
      RAISE EXCEPTION 'Only the group creator can assign elevated group roles';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = NEW.group_id AND COALESCE(g.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'Cannot join inactive group';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_group_members_write ON public.group_members;
CREATE TRIGGER tg_guard_group_members_write
BEFORE INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.guard_group_members_write();

CREATE OR REPLACE FUNCTION public.guard_group_messages_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sender_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
      RAISE EXCEPTION 'Cannot send as another user';
    END IF;

    IF NOT public.is_group_member(NEW.group_id, NEW.sender_id) THEN
      RAISE EXCEPTION 'Only group members can send messages';
    END IF;

    NEW.content := btrim(COALESCE(NEW.content, ''));
    IF NEW.content = '' OR char_length(NEW.content) > 5000 THEN
      RAISE EXCEPTION 'Invalid message content';
    END IF;

    IF COALESCE(NEW.message_type, 'text') NOT IN ('text', 'image', 'video', 'audio', 'gift') THEN
      RAISE EXCEPTION 'Invalid message type';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Group messages cannot be updated directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_group_messages_write ON public.group_messages;
CREATE TRIGGER tg_guard_group_messages_write
BEFORE INSERT OR UPDATE ON public.group_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_group_messages_write();

-- Restore realtime publication for chat tables.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;