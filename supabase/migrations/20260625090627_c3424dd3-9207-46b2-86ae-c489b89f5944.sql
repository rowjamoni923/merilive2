
-- Drop legacy RPC signatures that may conflict
DROP FUNCTION IF EXISTS public.add_group_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_chat_group(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_chat_group(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_chat_group(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_chat_group(text, text, text, text, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.remove_group_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.leave_group(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.delete_group(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_group_info(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_group_info(uuid, text, text, text, boolean, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.search_public_groups(text, int) CASCADE;
DROP FUNCTION IF EXISTS public.search_group_members(uuid, text, int) CASCADE;
DROP FUNCTION IF EXISTS public.pin_group_message(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.unpin_group_message(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.set_group_member_role(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_group_ownership(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reset_group_invite(uuid, timestamptz, int) CASCADE;
DROP FUNCTION IF EXISTS public.join_via_invite(text) CASCADE;
DROP FUNCTION IF EXISTS public.decide_group_join_request(uuid, boolean) CASCADE;

-- Fix prerequisites
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_group_type_check;
ALTER TABLE public.groups ADD CONSTRAINT groups_group_type_check CHECK (group_type IN ('basic','family','public'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.groups'::regclass AND contype='p') THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.group_messages'::regclass AND contype='p') THEN
    ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.group_members'::regclass AND contype='p') THEN
    ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 1) GROUPS additions
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_max_uses int,
  ADD COLUMN IF NOT EXISTS invite_used_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT
    '{"who_can_send":"all","who_can_edit_info":"admins","who_can_add_members":"admins","approve_new_members":false,"disappearing_seconds":0,"slow_mode_seconds":0}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.groups SET invite_token = encode(extensions.gen_random_bytes(12),'base64') WHERE invite_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS groups_invite_token_key ON public.groups(invite_token);

ALTER TABLE public.groups ALTER COLUMN max_members SET DEFAULT 5000;
UPDATE public.groups SET max_members = 5000 WHERE max_members = 100;

-- 2) GROUP_MEMBERS
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_read_message_id uuid,
  ADD COLUMN IF NOT EXISTS notifications_muted boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON public.group_members(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members(user_id);

-- 3) GROUP_MESSAGES
ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='group_messages_reply_to_fk') THEN
    ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_reply_to_fk
      FOREIGN KEY (reply_to_id) REFERENCES public.group_messages(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON public.group_messages(group_id, created_at DESC);

-- 4) New tables
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz, decided_by uuid, note text,
  UNIQUE(group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_join_requests TO authenticated;
GRANT ALL ON public.group_join_requests TO service_role;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "request_self_insert" ON public.group_join_requests;
CREATE POLICY "request_self_insert" ON public.group_join_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "request_self_or_admin_read" ON public.group_join_requests;
CREATE POLICY "request_self_or_admin_read" ON public.group_join_requests FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_join_requests.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
);
DROP POLICY IF EXISTS "request_admin_update" ON public.group_join_requests;
CREATE POLICY "request_admin_update" ON public.group_join_requests FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_join_requests.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
);

CREATE TABLE IF NOT EXISTS public.group_pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.group_pinned_messages TO authenticated;
GRANT ALL ON public.group_pinned_messages TO service_role;
ALTER TABLE public.group_pinned_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pin_member_read" ON public.group_pinned_messages;
CREATE POLICY "pin_member_read" ON public.group_pinned_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_pinned_messages.group_id AND gm.user_id = auth.uid())
);
DROP POLICY IF EXISTS "pin_admin_write" ON public.group_pinned_messages;
CREATE POLICY "pin_admin_write" ON public.group_pinned_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_pinned_messages.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
);
DROP POLICY IF EXISTS "pin_admin_delete" ON public.group_pinned_messages;
CREATE POLICY "pin_admin_delete" ON public.group_pinned_messages FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_pinned_messages.group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
);

CREATE TABLE IF NOT EXISTS public.group_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.group_message_reactions TO authenticated;
GRANT ALL ON public.group_message_reactions TO service_role;
ALTER TABLE public.group_message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "react_member_read" ON public.group_message_reactions;
CREATE POLICY "react_member_read" ON public.group_message_reactions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.group_messages m JOIN public.group_members gm ON gm.group_id = m.group_id AND gm.user_id = auth.uid() WHERE m.id = group_message_reactions.message_id)
);
DROP POLICY IF EXISTS "react_self_write" ON public.group_message_reactions;
CREATE POLICY "react_self_write" ON public.group_message_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "react_self_delete" ON public.group_message_reactions;
CREATE POLICY "react_self_delete" ON public.group_message_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.group_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL, by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_group_mentions_user_unseen ON public.group_mentions(mentioned_user_id) WHERE seen_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.group_mentions TO authenticated;
GRANT ALL ON public.group_mentions TO service_role;
ALTER TABLE public.group_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mention_self_read" ON public.group_mentions;
CREATE POLICY "mention_self_read" ON public.group_mentions FOR SELECT TO authenticated USING (mentioned_user_id = auth.uid());
DROP POLICY IF EXISTS "mention_self_update" ON public.group_mentions;
CREATE POLICY "mention_self_update" ON public.group_mentions FOR UPDATE TO authenticated USING (mentioned_user_id = auth.uid());
DROP POLICY IF EXISTS "mention_sender_insert" ON public.group_mentions;
CREATE POLICY "mention_sender_insert" ON public.group_mentions FOR INSERT TO authenticated WITH CHECK (by_user_id = auth.uid());

-- 5) Triggers
CREATE OR REPLACE FUNCTION public.tg_groups_touch_updated() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_groups_touch_updated ON public.groups;
CREATE TRIGGER trg_groups_touch_updated BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.tg_groups_touch_updated();

CREATE OR REPLACE FUNCTION public.tg_enforce_family_exclusivity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text;
BEGIN
  SELECT group_type INTO v_type FROM public.groups WHERE id = NEW.group_id;
  IF v_type = 'family' AND EXISTS (
    SELECT 1 FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = NEW.user_id AND g.group_type = 'family' AND gm.group_id <> NEW.group_id
  ) THEN RAISE EXCEPTION 'FAMILY_GROUP_EXCLUSIVE: user already in a family group'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_family_exclusivity ON public.group_members;
CREATE TRIGGER trg_enforce_family_exclusivity BEFORE INSERT ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_family_exclusivity();

CREATE OR REPLACE FUNCTION public.tg_groups_member_count() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
  END IF; RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_group_members_count ON public.group_members;
CREATE TRIGGER trg_group_members_count AFTER INSERT OR DELETE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.tg_groups_member_count();

CREATE OR REPLACE FUNCTION public.tg_enforce_pin_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.group_pinned_messages WHERE group_id = NEW.group_id) >= 3 THEN
    RAISE EXCEPTION 'PIN_LIMIT_REACHED: max 3 pinned messages per group';
  END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_pin_limit ON public.group_pinned_messages;
CREATE TRIGGER trg_enforce_pin_limit BEFORE INSERT ON public.group_pinned_messages FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_pin_limit();

-- 6) RPCs
CREATE FUNCTION public.create_chat_group(
  p_name text, p_group_type text DEFAULT 'basic', p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL, p_is_public boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_group_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_group_type NOT IN ('basic','family','public') THEN RAISE EXCEPTION 'INVALID_GROUP_TYPE'; END IF;
  IF p_group_type = 'family' AND EXISTS (
    SELECT 1 FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_uid AND g.group_type = 'family'
  ) THEN RAISE EXCEPTION 'FAMILY_GROUP_EXCLUSIVE: leave your current family group first'; END IF;
  INSERT INTO public.groups(name, description, avatar_url, created_by, owner_id, group_type, is_public, invite_token)
  VALUES (p_name, p_description, p_avatar_url, v_uid, v_uid, p_group_type,
          COALESCE(p_is_public,false) AND p_group_type <> 'family',
          encode(extensions.gen_random_bytes(12),'base64'))
  RETURNING id INTO v_group_id;
  INSERT INTO public.group_members(group_id, user_id, role) VALUES (v_group_id, v_uid, 'owner');
  RETURN v_group_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_chat_group(text,text,text,text,boolean) TO authenticated;

CREATE FUNCTION public.add_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_max int; v_count int; v_who text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT max_members, member_count, settings->>'who_can_add_members' INTO v_max, v_count, v_who FROM public.groups WHERE id = p_group_id;
  IF v_max IS NULL THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
  IF v_count >= v_max THEN RAISE EXCEPTION 'GROUP_FULL'; END IF;
  IF v_who = 'admins' THEN
    IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role IN ('owner','admin'))
    THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid)
    THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;
  END IF;
  INSERT INTO public.group_members(group_id, user_id, role) VALUES (p_group_id, p_user_id, 'member') ON CONFLICT DO NOTHING;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_group_member(uuid,uuid) TO authenticated;

CREATE FUNCTION public.remove_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_target_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_uid <> p_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role IN ('owner','admin'))
    THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  END IF;
  SELECT role INTO v_target_role FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_id;
  IF v_target_role = 'owner' THEN RAISE EXCEPTION 'CANNOT_REMOVE_OWNER'; END IF;
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid,uuid) TO authenticated;

CREATE FUNCTION public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_role NOT IN ('admin','member') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role = 'owner')
  THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
  UPDATE public.group_members SET role = p_role WHERE group_id = p_group_id AND user_id = p_user_id AND role <> 'owner';
END; $$;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role = 'owner')
  THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = p_new_owner)
  THEN RAISE EXCEPTION 'NEW_OWNER_NOT_MEMBER'; END IF;
  UPDATE public.group_members SET role = 'admin' WHERE group_id = p_group_id AND user_id = v_uid;
  UPDATE public.group_members SET role = 'owner' WHERE group_id = p_group_id AND user_id = p_new_owner;
  UPDATE public.groups SET owner_id = p_new_owner WHERE id = p_group_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(uuid,uuid) TO authenticated;

CREATE FUNCTION public.update_group_info(
  p_group_id uuid, p_name text DEFAULT NULL, p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL, p_is_public boolean DEFAULT NULL, p_settings jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_who text; v_gtype text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT settings->>'who_can_edit_info', group_type INTO v_who, v_gtype FROM public.groups WHERE id = p_group_id;
  IF v_who = 'admins' THEN
    IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role IN ('owner','admin'))
    THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid)
    THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;
  END IF;
  UPDATE public.groups SET
    name = COALESCE(p_name,name), description = COALESCE(p_description,description),
    avatar_url = COALESCE(p_avatar_url,avatar_url),
    is_public = CASE WHEN v_gtype='family' THEN false ELSE COALESCE(p_is_public,is_public) END,
    settings = COALESCE(p_settings, settings)
  WHERE id = p_group_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_group_info(uuid,text,text,text,boolean,jsonb) TO authenticated;

CREATE FUNCTION public.reset_group_invite(p_group_id uuid, p_expires_at timestamptz DEFAULT NULL, p_max_uses int DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_token text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  v_token := encode(extensions.gen_random_bytes(12),'base64');
  UPDATE public.groups SET invite_token = v_token, invite_expires_at = p_expires_at,
    invite_max_uses = p_max_uses, invite_used_count = 0 WHERE id = p_group_id;
  RETURN v_token;
END; $$;
GRANT EXECUTE ON FUNCTION public.reset_group_invite(uuid,timestamptz,int) TO authenticated;

CREATE FUNCTION public.join_via_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_group public.groups%ROWTYPE; v_needs_approval boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_group FROM public.groups WHERE invite_token = p_token AND COALESCE(is_active,true) = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_INVITE'; END IF;
  IF v_group.invite_expires_at IS NOT NULL AND v_group.invite_expires_at < now() THEN RAISE EXCEPTION 'INVITE_EXPIRED'; END IF;
  IF v_group.invite_max_uses IS NOT NULL AND v_group.invite_used_count >= v_group.invite_max_uses THEN RAISE EXCEPTION 'INVITE_LIMIT'; END IF;
  IF v_group.member_count >= v_group.max_members THEN RAISE EXCEPTION 'GROUP_FULL'; END IF;
  IF v_group.group_type = 'family' AND EXISTS (
    SELECT 1 FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_uid AND g.group_type = 'family'
  ) THEN RAISE EXCEPTION 'FAMILY_GROUP_EXCLUSIVE'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_group.id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('status','already_member','group_id', v_group.id);
  END IF;
  v_needs_approval := COALESCE((v_group.settings->>'approve_new_members')::boolean, false);
  IF v_needs_approval THEN
    INSERT INTO public.group_join_requests(group_id, user_id) VALUES (v_group.id, v_uid) ON CONFLICT (group_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('status','pending','group_id', v_group.id);
  END IF;
  INSERT INTO public.group_members(group_id, user_id, role) VALUES (v_group.id, v_uid, 'member');
  UPDATE public.groups SET invite_used_count = invite_used_count + 1 WHERE id = v_group.id;
  RETURN jsonb_build_object('status','joined','group_id', v_group.id);
END; $$;
GRANT EXECUTE ON FUNCTION public.join_via_invite(text) TO authenticated;

CREATE FUNCTION public.decide_group_join_request(p_request_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.group_join_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_req FROM public.group_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_req.group_id AND user_id = v_uid AND role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.group_join_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_at = now(), decided_by = v_uid WHERE id = p_request_id;
  IF p_approve THEN
    INSERT INTO public.group_members(group_id, user_id, role) VALUES (v_req.group_id, v_req.user_id, 'member') ON CONFLICT DO NOTHING;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.decide_group_join_request(uuid,boolean) TO authenticated;

CREATE FUNCTION public.search_public_groups(p_q text DEFAULT NULL, p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, name text, description text, avatar_url text, member_count int, group_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.description, g.avatar_url, g.member_count, g.group_type FROM public.groups g
  WHERE g.is_public = true AND COALESCE(g.is_active,true) = true
    AND (p_q IS NULL OR g.name ILIKE '%'||p_q||'%' OR g.description ILIKE '%'||p_q||'%')
  ORDER BY g.member_count DESC, g.created_at DESC LIMIT GREATEST(p_limit,1);
$$;
GRANT EXECUTE ON FUNCTION public.search_public_groups(text,int) TO authenticated, anon;

CREATE FUNCTION public.search_group_members(p_group_id uuid, p_q text DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE(user_id uuid, role text, joined_at timestamptz, full_name text, username text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = auth.uid())
  THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;
  RETURN QUERY
    SELECT gm.user_id, gm.role, gm.joined_at, p.full_name, p.username, p.avatar_url
    FROM public.group_members gm LEFT JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.group_id = p_group_id
      AND (p_q IS NULL OR p.full_name ILIKE '%'||p_q||'%' OR p.username ILIKE '%'||p_q||'%')
    ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, gm.joined_at ASC
    LIMIT GREATEST(p_limit,1);
END; $$;
GRANT EXECUTE ON FUNCTION public.search_group_members(uuid,text,int) TO authenticated;

CREATE FUNCTION public.pin_group_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_gid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT group_id INTO v_gid FROM public.group_messages WHERE id = p_message_id;
  IF v_gid IS NULL THEN RAISE EXCEPTION 'MESSAGE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_gid AND user_id = v_uid AND role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  INSERT INTO public.group_pinned_messages(group_id, message_id, pinned_by) VALUES (v_gid, p_message_id, v_uid) ON CONFLICT DO NOTHING;
  UPDATE public.group_messages SET pinned_at = now(), pinned_by = v_uid WHERE id = p_message_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.pin_group_message(uuid) TO authenticated;

CREATE FUNCTION public.unpin_group_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_gid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT group_id INTO v_gid FROM public.group_messages WHERE id = p_message_id;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_gid AND user_id = v_uid AND role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  DELETE FROM public.group_pinned_messages WHERE message_id = p_message_id;
  UPDATE public.group_messages SET pinned_at = NULL, pinned_by = NULL WHERE id = p_message_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.unpin_group_message(uuid) TO authenticated;

CREATE FUNCTION public.leave_group(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT role INTO v_role FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid;
  IF v_role = 'owner' THEN RAISE EXCEPTION 'OWNER_MUST_TRANSFER_OR_DELETE'; END IF;
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid;
END; $$;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;

CREATE FUNCTION public.delete_group(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_uid AND role = 'owner')
  THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
  UPDATE public.groups SET is_active = false, deleted_at = now() WHERE id = p_group_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_group(uuid) TO authenticated;

-- 7) Realtime
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_pinned_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_message_reactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_join_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_mentions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
