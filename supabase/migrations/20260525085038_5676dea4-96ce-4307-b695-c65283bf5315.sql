-- Pkg329 pass-3: group message guard + audio compatibility + official notice realtime

CREATE OR REPLACE FUNCTION public.tg_guard_group_messages_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_banned boolean := false;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_active_admin_session() THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'auth_required';
    END IF;

    IF NEW.sender_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'sender_mismatch';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
      WHERE gm.group_id = NEW.group_id
        AND gm.user_id = v_uid
        AND COALESCE(g.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'not_group_member';
    END IF;
  END IF;

  NEW.message_type := COALESCE(NULLIF(btrim(NEW.message_type), ''), 'text');
  IF NEW.message_type = 'voice' THEN
    NEW.message_type := 'audio';
  END IF;

  IF char_length(btrim(coalesce(NEW.content, ''))) = 0 THEN
    RAISE EXCEPTION 'empty_message';
  END IF;

  IF char_length(NEW.content) > 4000 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  IF NEW.message_type NOT IN ('text', 'image', 'audio', 'video', 'sticker', 'gift', 'file', 'system') THEN
    RAISE EXCEPTION 'invalid_message_type';
  END IF;

  SELECT COALESCE(is_banned, false) OR COALESCE(is_deleted, false)
    INTO v_banned
  FROM public.profiles
  WHERE id = NEW.sender_id OR user_id = NEW.sender_id
  LIMIT 1;

  IF COALESCE(v_banned, false) THEN
    RAISE EXCEPTION 'sender_blocked';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_group_messages_insert ON public.group_messages;
CREATE TRIGGER guard_group_messages_insert
BEFORE INSERT ON public.group_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_group_messages_insert();

CREATE OR REPLACE FUNCTION public.tg_guard_group_messages_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'group_message_update_not_allowed';
END;
$$;

DROP TRIGGER IF EXISTS guard_group_messages_update ON public.group_messages;
CREATE TRIGGER guard_group_messages_update
BEFORE UPDATE ON public.group_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_group_messages_update();

CREATE OR REPLACE FUNCTION public.tg_guard_group_members_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'group_member_update_not_allowed';
END;
$$;

DROP TRIGGER IF EXISTS guard_group_members_update ON public.group_members;
CREATE TRIGGER guard_group_members_update
BEFORE UPDATE ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_group_members_update();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_notices'
  ) THEN
    ALTER TABLE public.admin_notices REPLICA IDENTITY FULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'admin_notices'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notices;
    END IF;
  END IF;
END $$;