-- Section #13 pass-2: DM/Chat/Block hardening

-- 1) Clean up impossible self-conversations before enforcing the rule.
DELETE FROM public.messages m
USING public.conversations c
WHERE m.conversation_id = c.id
  AND c.participant1_id = c.participant2_id;

DELETE FROM public.conversations
WHERE participant1_id = participant2_id;

-- 2) Add structural constraints where missing. Keep NOT VALID where old data in other areas should not block deploy.
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_no_self_participants,
  ADD CONSTRAINT conversations_no_self_participants CHECK (participant1_id <> participant2_id);

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_valid,
  ADD CONSTRAINT messages_type_valid CHECK (
    message_type IS NULL OR message_type IN ('text','image','video','audio','gift','sticker','emoji','file','system','call')
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_status_valid,
  ADD CONSTRAINT messages_status_valid CHECK (
    status IS NULL OR status IN ('sent','delivered','read')
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length_limit,
  ADD CONSTRAINT messages_content_length_limit CHECK (length(content) <= 4000);

ALTER TABLE public.user_blocks
  DROP CONSTRAINT IF EXISTS user_blocks_no_self_block,
  ADD CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id);

ALTER TABLE public.blocked_users
  DROP CONSTRAINT IF EXISTS blocked_users_no_self_block,
  ADD CONSTRAINT blocked_users_no_self_block CHECK (blocker_id <> blocked_id);

-- 3) Make user-facing RPCs caller-bound. These are SECURITY DEFINER, so they must never trust caller-supplied user ids blindly.
CREATE OR REPLACE FUNCTION public.get_conversations_with_details(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  _uid uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  IF NOT (public.is_active_admin_session() OR (_uid IS NOT NULL AND _uid = p_user_id)) THEN
    RAISE EXCEPTION 'Not authorized to view these conversations';
  END IF;

  SELECT json_agg(conv_data ORDER BY last_message_at DESC NULLS LAST)
  INTO result
  FROM (
    SELECT
      c.id,
      c.participant1_id,
      c.participant2_id,
      c.last_message_at,
      c.created_at,
      json_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'is_online', p.is_online,
        'is_verified', p.is_verified,
        'is_host', p.is_host,
        'gender', p.gender,
        'user_level', p.user_level,
        'host_level', p.host_level,
        'max_user_level', p.max_user_level,
        'country_flag', p.country_flag,
        'country_name', p.country_name,
        'city', p.city,
        'last_seen_at', p.last_seen_at,
        'call_rate_per_minute', p.call_rate_per_minute
      ) AS other_user,
      (
        SELECT m.content
        FROM public.messages m
        WHERE m.conversation_id = c.id
          AND COALESCE(m.is_deleted, false) = false
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT count(*)::int
        FROM public.messages m
        WHERE m.conversation_id = c.id
          AND COALESCE(m.is_read, false) = false
          AND m.sender_id <> p_user_id
          AND COALESCE(m.is_deleted, false) = false
      ) AS unread_count
    FROM public.conversations c
    LEFT JOIN public.profiles p ON p.id = CASE
      WHEN c.participant1_id = p_user_id THEN c.participant2_id
      ELSE c.participant1_id
    END
    WHERE c.participant1_id = p_user_id OR c.participant2_id = p_user_id
  ) conv_data;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_conversations_with_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversations_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversations_with_details(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_messages_delivered(p_conversation_id uuid, p_recipient_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR _uid <> p_recipient_id THEN
    RAISE EXCEPTION 'recipient must match authenticated user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.participant1_id = p_recipient_id OR c.participant2_id = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  UPDATE public.messages
  SET delivered_at = COALESCE(delivered_at, now()),
      status = CASE WHEN status = 'read' THEN status ELSE 'delivered' END
  WHERE conversation_id = p_conversation_id
    AND sender_id <> p_recipient_id
    AND delivered_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_messages_delivered(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(uuid, uuid) TO service_role;

-- 4) Harden message/conversation/block triggers.
CREATE OR REPLACE FUNCTION public.guard_message_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _p1 uuid;
  _p2 uuid;
  _other uuid;
  _is_sender boolean;
  _is_recipient boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF _uid IS NULL THEN
      RETURN NEW; -- trusted service-role/system path
    END IF;

    IF NEW.sender_id IS NULL OR NEW.sender_id <> _uid THEN
      RAISE EXCEPTION 'sender_id must match authenticated user';
    END IF;

    SELECT participant1_id, participant2_id
      INTO _p1, _p2
      FROM public.conversations
     WHERE id = NEW.conversation_id;

    IF _p1 IS NULL THEN
      RAISE EXCEPTION 'Conversation not found';
    END IF;
    IF _uid <> _p1 AND _uid <> _p2 THEN
      RAISE EXCEPTION 'Not a participant of this conversation';
    END IF;

    _other := CASE WHEN _uid = _p1 THEN _p2 ELSE _p1 END;

    IF EXISTS (
      SELECT 1 FROM public.user_blocks
       WHERE (blocker_id = _uid AND blocked_id = _other)
          OR (blocker_id = _other AND blocked_id = _uid)
    ) OR EXISTS (
      SELECT 1 FROM public.blocked_users
       WHERE (blocker_id = _uid AND blocked_id = _other)
          OR (blocker_id = _other AND blocked_id = _uid)
    ) THEN
      RAISE EXCEPTION 'You cannot message a user you have blocked or who has blocked you';
    END IF;

    NEW.message_type := COALESCE(NEW.message_type, 'text');
    IF NEW.message_type NOT IN ('text','image','video','audio','gift','sticker','emoji','file','system','call') THEN
      RAISE EXCEPTION 'Invalid message_type: %', NEW.message_type;
    END IF;
    IF NEW.content IS NULL OR length(NEW.content) = 0 THEN
      RAISE EXCEPTION 'Message content required';
    END IF;
    IF length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'Message content exceeds 4000 character limit';
    END IF;

    NEW.created_at := now();
    NEW.is_read := false;
    NEW.read_at := NULL;
    NEW.delivered_at := NULL;
    NEW.is_deleted := false;
    NEW.status := 'sent';
    NEW.is_ai_reply := COALESCE(NEW.is_ai_reply, false);
    RETURN NEW;
  END IF;

  IF _uid IS NULL THEN
    RETURN NEW; -- trusted service-role/system path
  END IF;

  SELECT participant1_id, participant2_id
    INTO _p1, _p2
    FROM public.conversations
   WHERE id = OLD.conversation_id;

  IF _p1 IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  _is_sender := (_uid = OLD.sender_id);
  _is_recipient := ((_uid = _p1 OR _uid = _p2) AND _uid <> OLD.sender_id);

  IF NOT (_is_sender OR _is_recipient OR public.is_admin(_uid) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Not authorized to update this message';
  END IF;

  IF NEW.id <> OLD.id
     OR NEW.conversation_id <> OLD.conversation_id
     OR NEW.sender_id <> OLD.sender_id
     OR NEW.created_at <> OLD.created_at
     OR NEW.message_type <> OLD.message_type
     OR COALESCE(NEW.reply_to_id::text,'') <> COALESCE(OLD.reply_to_id::text,'')
     OR COALESCE(NEW.media_url,'') <> COALESCE(OLD.media_url,'')
     OR COALESCE(NEW.is_encrypted,false) <> COALESCE(OLD.is_encrypted,false)
     OR COALESCE(NEW.encryption_version,0) <> COALESCE(OLD.encryption_version,0)
     OR COALESCE(NEW.is_ai_reply,false) <> COALESCE(OLD.is_ai_reply,false)
  THEN
    IF NOT (public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Cannot modify message identity fields';
    END IF;
  END IF;

  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('sent','delivered','read') THEN
    RAISE EXCEPTION 'Invalid message status: %', NEW.status;
  END IF;

  IF COALESCE(NEW.content,'') <> COALESCE(OLD.content,'') THEN
    IF NOT (_is_sender OR public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Only the sender can modify message content';
    END IF;
    IF NOT COALESCE(NEW.is_deleted,false) AND NOT (public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Message content can only be cleared when deleting';
    END IF;
    IF length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'Message content exceeds 4000 character limit';
    END IF;
  END IF;

  IF COALESCE(NEW.is_deleted,false) <> COALESCE(OLD.is_deleted,false) THEN
    IF NOT (_is_sender OR public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Only sender can delete their message';
    END IF;
    IF COALESCE(OLD.is_deleted,false) AND NOT (public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Cannot un-delete a message';
    END IF;
  END IF;

  IF COALESCE(NEW.is_read,false) <> COALESCE(OLD.is_read,false) THEN
    IF COALESCE(OLD.is_read,false) AND NOT (public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Cannot mark a read message unread';
    END IF;
    IF COALESCE(NEW.is_read,false) AND NOT (_is_recipient OR public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Only recipient can mark message read';
    END IF;
  END IF;

  IF COALESCE(NEW.is_read,false) AND NOT COALESCE(OLD.is_read,false) THEN
    NEW.read_at := COALESCE(NEW.read_at, now());
    NEW.status := 'read';
  END IF;

  IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    IF NEW.delivered_at IS NULL AND OLD.delivered_at IS NOT NULL AND NOT (public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Cannot clear delivery timestamp';
    END IF;
    IF NEW.delivered_at IS NOT NULL AND NOT (_is_recipient OR public.is_admin(_uid) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Only recipient can mark message delivered';
    END IF;
    IF NEW.status <> 'read' THEN
      NEW.status := 'delivered';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_message_read_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.conversations
     SET last_message = CASE WHEN COALESCE(NEW.is_deleted, false) THEN NULL ELSE NEW.content END,
         last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_block_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.blocker_id IS NULL OR NEW.blocked_id IS NULL THEN
    RAISE EXCEPTION 'blocker_id and blocked_id required';
  END IF;
  IF NEW.blocker_id = NEW.blocked_id THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.blocker_id AND NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'blocker_id must match authenticated user';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_user_blocks_trg ON public.user_blocks;
CREATE TRIGGER guard_user_blocks_trg
BEFORE INSERT OR UPDATE ON public.user_blocks
FOR EACH ROW EXECUTE FUNCTION public.guard_block_fields();

DROP TRIGGER IF EXISTS guard_blocked_users_trg ON public.blocked_users;
CREATE TRIGGER guard_blocked_users_trg
BEFORE INSERT OR UPDATE ON public.blocked_users
FOR EACH ROW EXECUTE FUNCTION public.guard_block_fields();

-- 5) Tighten RLS role exposure for user tables.
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
CREATE POLICY "Users can update messages in their conversations"
ON public.messages
FOR UPDATE
TO authenticated
USING (public.is_conversation_participant(auth.uid(), conversation_id))
WITH CHECK (public.is_conversation_participant(auth.uid(), conversation_id));

DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
CREATE POLICY "Users can update own conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING ((auth.uid() = participant1_id) OR (auth.uid() = participant2_id))
WITH CHECK ((auth.uid() = participant1_id) OR (auth.uid() = participant2_id));