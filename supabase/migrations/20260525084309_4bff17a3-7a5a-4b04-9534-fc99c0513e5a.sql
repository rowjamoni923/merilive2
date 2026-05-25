-- =========================================================
-- Pkg329: Chat / Official notice / Notification / Group msg
-- =========================================================

-- ---------- 1. groups: type whitelist, name cap, force creator ----------
CREATE OR REPLACE FUNCTION public.tg_guard_groups_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF char_length(coalesce(NEW.name,'')) < 1 OR char_length(NEW.name) > 80 THEN
    RAISE EXCEPTION 'invalid_group_name';
  END IF;
  IF coalesce(NEW.group_type,'basic') NOT IN ('basic','family') THEN
    RAISE EXCEPTION 'invalid_group_type';
  END IF;
  IF NEW.max_members IS NULL OR NEW.max_members > 500 THEN NEW.max_members := 500; END IF;
  IF NEW.max_members < 2 THEN NEW.max_members := 2; END IF;
  NEW.owner_id := v_uid;
  NEW.created_by := v_uid;
  NEW.member_count := COALESCE(NEW.member_count, 0);
  NEW.is_active := COALESCE(NEW.is_active, true);
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_groups_insert ON public.groups;
CREATE TRIGGER guard_groups_insert BEFORE INSERT ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_groups_insert();

-- groups UPDATE column allowlist for non-admin
CREATE OR REPLACE FUNCTION public.tg_guard_groups_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- creator/owner can only edit a small set of presentation fields
  NEW.id := OLD.id;
  NEW.group_type := OLD.group_type;
  NEW.owner_id := OLD.owner_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.member_count := OLD.member_count;
  NEW.group_code := OLD.group_code;
  IF NEW.max_members IS DISTINCT FROM OLD.max_members THEN NEW.max_members := OLD.max_members; END IF;
  -- name/description/avatar_url/is_active allowed
  IF char_length(coalesce(NEW.name,'')) < 1 OR char_length(NEW.name) > 80 THEN
    RAISE EXCEPTION 'invalid_group_name';
  END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_groups_update ON public.groups;
CREATE TRIGGER guard_groups_update BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_groups_update();

-- ---------- 2. group_members: enforce caps + ban + role ----------
CREATE OR REPLACE FUNCTION public.tg_guard_group_members_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_grp public.groups%ROWTYPE;
  v_cnt int;
  v_banned boolean;
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  -- Block forging other users
  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    -- only owner/admin role of the group may add others
    IF NOT EXISTS (SELECT 1 FROM public.group_members gm
                   WHERE gm.group_id = NEW.group_id AND gm.user_id = v_uid
                     AND gm.role IN ('owner','admin')) THEN
      RAISE EXCEPTION 'cannot_add_others';
    END IF;
  END IF;

  SELECT * INTO v_grp FROM public.groups WHERE id = NEW.group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found'; END IF;
  IF COALESCE(v_grp.is_active, true) = false THEN RAISE EXCEPTION 'group_inactive'; END IF;

  -- ban check on the user being added
  SELECT (COALESCE(is_banned,false) OR COALESCE(is_deleted,false))
    INTO v_banned FROM public.profiles WHERE user_id = NEW.user_id;
  IF v_banned THEN RAISE EXCEPTION 'user_blocked'; END IF;

  -- role: only owner/admin of group may set elevated; first member is creator (owner)
  IF NEW.user_id = v_uid AND NEW.role IS DISTINCT FROM 'member' THEN
    IF NEW.role = 'owner' THEN
      IF v_grp.owner_id <> v_uid THEN RAISE EXCEPTION 'not_owner'; END IF;
      IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = NEW.group_id AND role='owner') THEN
        -- owner row already exists; reject second owner-self-insert
        RAISE EXCEPTION 'owner_already_exists';
      END IF;
    ELSE
      NEW.role := 'member';
    END IF;
  END IF;

  -- capacity
  SELECT count(*) INTO v_cnt FROM public.group_members WHERE group_id = NEW.group_id;
  IF v_cnt >= COALESCE(v_grp.max_members, 500) THEN
    RAISE EXCEPTION 'group_full';
  END IF;

  -- per-user limits (basic 20 / family 1)
  IF v_grp.group_type = 'family' THEN
    IF EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
      WHERE gm.user_id = NEW.user_id AND g.group_type='family'
    ) THEN RAISE EXCEPTION 'family_limit_reached'; END IF;
  ELSIF v_grp.group_type = 'basic' THEN
    SELECT count(*) INTO v_cnt FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
      WHERE gm.user_id = NEW.user_id AND g.group_type='basic';
    IF v_cnt >= 20 THEN RAISE EXCEPTION 'basic_limit_reached'; END IF;
  END IF;

  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_group_members_insert ON public.group_members;
CREATE TRIGGER guard_group_members_insert BEFORE INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_group_members_insert();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_members_group_user
  ON public.group_members(group_id, user_id);

-- group_members member_count maintenance
CREATE OR REPLACE FUNCTION public.tg_group_members_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET member_count = COALESCE(member_count,0) + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET member_count = GREATEST(COALESCE(member_count,1) - 1, 0) WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END$$;
DROP TRIGGER IF EXISTS group_members_count_ins ON public.group_members;
DROP TRIGGER IF EXISTS group_members_count_del ON public.group_members;
CREATE TRIGGER group_members_count_ins AFTER INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.tg_group_members_count();
CREATE TRIGGER group_members_count_del AFTER DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.tg_group_members_count();

-- Backfill member_count once
UPDATE public.groups g
SET member_count = sub.c
FROM (SELECT group_id, count(*) AS c FROM public.group_members GROUP BY group_id) sub
WHERE g.id = sub.group_id;

-- ---------- 3. group_messages: content cap + type whitelist + ban ----------
CREATE OR REPLACE FUNCTION public.tg_guard_group_messages_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text := current_setting('request.jwt.claim.role', true); v_banned boolean;
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF char_length(coalesce(NEW.content,'')) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  IF char_length(NEW.content) > 4000 THEN RAISE EXCEPTION 'message_too_long'; END IF;
  IF coalesce(NEW.message_type,'text') NOT IN ('text','image','voice','video','sticker','gift','file','system') THEN
    RAISE EXCEPTION 'invalid_message_type';
  END IF;
  SELECT (COALESCE(is_banned,false) OR COALESCE(is_deleted,false))
    INTO v_banned FROM public.profiles WHERE user_id = NEW.sender_id;
  IF v_banned THEN RAISE EXCEPTION 'sender_blocked'; END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_group_messages_insert ON public.group_messages;
CREATE TRIGGER guard_group_messages_insert BEFORE INSERT ON public.group_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_group_messages_insert();

-- ---------- 4. notifications hardening ----------
-- (a) block self-forging dangerous types
CREATE OR REPLACE FUNCTION public.tg_guard_notifications_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() THEN RETURN NEW; END IF;
  -- when an end-user is inserting (auth.uid()=user_id), block dangerous bridge types
  IF NEW.type IS NULL THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF NEW.type IN (
    'incoming_call','call_received','call_missed',
    'admin_message','admin_message_reply','admin_notice','admin_warning',
    'system','security','report_resolved',
    'topup_approved','topup_rejected','withdrawal_approved','withdrawal_rejected',
    'level_upgrade_approved','level_upgrade_rejected','helper_approved','helper_rejected',
    'payroll_approved','payroll_rejected','host_approved','host_rejected',
    'gift_received','gift','coins_added','coins_received','coin_purchase_helper',
    'coin_purchase_direct','diamonds_credited','payment_completed','beans_exchanged',
    'agency_approved','agency_verification','agency_withdrawal_approved','agency_diamond_received',
    'app_sync'
  ) OR NEW.type LIKE 'pk\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'restricted_notification_type';
  END IF;
  IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
  IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_notifications_insert ON public.notifications;
CREATE TRIGGER guard_notifications_insert BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_notifications_insert();

-- (b) UPDATE column allowlist (freeze everything except is_read for non-admin)
CREATE OR REPLACE FUNCTION public.tg_guard_notifications_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.user_id := OLD.user_id;
  NEW.type := OLD.type;
  NEW.title := OLD.title;
  NEW.message := OLD.message;
  NEW.data := OLD.data;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS guard_notifications_update ON public.notifications;
CREATE TRIGGER guard_notifications_update BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_notifications_update();

-- ---------- 5. admin_notices read-tracking RPC ----------
CREATE OR REPLACE FUNCTION public.mark_notice_read(_notice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  UPDATE public.admin_notices
     SET read_by = (
       SELECT array(SELECT DISTINCT x FROM unnest(COALESCE(read_by, ARRAY[]::uuid[]) || v_uid) AS x)
     )
   WHERE id = _notice_id
     AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND NOT (v_uid = ANY(COALESCE(read_by, ARRAY[]::uuid[])));
END$$;
REVOKE ALL ON FUNCTION public.mark_notice_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notice_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notices_read()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_cnt int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  WITH upd AS (
    UPDATE public.admin_notices
       SET read_by = (
         SELECT array(SELECT DISTINCT x FROM unnest(COALESCE(read_by, ARRAY[]::uuid[]) || v_uid) AS x)
       )
     WHERE is_active = true
       AND (expires_at IS NULL OR expires_at > now())
       AND NOT (v_uid = ANY(COALESCE(read_by, ARRAY[]::uuid[])))
     RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM upd;
  RETURN COALESCE(v_cnt,0);
END$$;
REVOKE ALL ON FUNCTION public.mark_all_notices_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notices_read() TO authenticated;