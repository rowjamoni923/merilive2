
-- =========================================================
-- Pkg281 / Section #13 — DM / Chat & Block deep audit pass-1
-- =========================================================

-- ---------- A. CONVERSATIONS hardening ----------

-- Drop & recreate UPDATE policy with strict with_check (no participant rewrites)
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
CREATE POLICY "Users can update own conversations"
ON public.conversations
FOR UPDATE
USING (auth.uid() = participant1_id OR auth.uid() = participant2_id)
WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- Guard trigger: freeze immutable columns + sanitize on insert
CREATE OR REPLACE FUNCTION public.guard_conversation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p1 uuid;
  _p2 uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF _uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NEW.participant1_id IS NULL OR NEW.participant2_id IS NULL THEN
      RAISE EXCEPTION 'Both participants required';
    END IF;
    IF NEW.participant1_id = NEW.participant2_id THEN
      RAISE EXCEPTION 'Cannot start a conversation with yourself';
    END IF;
    IF _uid <> NEW.participant1_id AND _uid <> NEW.participant2_id THEN
      RAISE EXCEPTION 'Creator must be a participant';
    END IF;

    -- Normalize so (p1,p2) is order-independent for uniqueness
    _p1 := LEAST(NEW.participant1_id, NEW.participant2_id);
    _p2 := GREATEST(NEW.participant1_id, NEW.participant2_id);
    NEW.participant1_id := _p1;
    NEW.participant2_id := _p2;

    -- Block check (either direction, both legacy tables)
    IF EXISTS (
      SELECT 1 FROM public.user_blocks
       WHERE (blocker_id = _p1 AND blocked_id = _p2)
          OR (blocker_id = _p2 AND blocked_id = _p1)
    ) OR EXISTS (
      SELECT 1 FROM public.blocked_users
       WHERE (blocker_id = _p1 AND blocked_id = _p2)
          OR (blocker_id = _p2 AND blocked_id = _p1)
    ) THEN
      RAISE EXCEPTION 'Cannot start a conversation with a blocked user';
    END IF;

    -- Reset volatile fields on insert
    NEW.last_message := NULL;
    NEW.last_message_at := NULL;
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE: lock immutable columns
  IF NEW.id <> OLD.id
     OR NEW.participant1_id <> OLD.participant1_id
     OR NEW.participant2_id <> OLD.participant2_id
     OR NEW.created_at <> OLD.created_at
     OR COALESCE(NEW.is_encrypted, false) <> COALESCE(OLD.is_encrypted, false)
  THEN
    -- Allow admins / service-role to override
    IF NOT (public.is_admin(auth.uid()) OR auth.uid() IS NULL) THEN
      RAISE EXCEPTION 'Cannot modify conversation identity fields';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_conversation_fields_trg ON public.conversations;
CREATE TRIGGER guard_conversation_fields_trg
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.guard_conversation_fields();

-- Unique conversation per user pair
CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_pair_idx
ON public.conversations (participant1_id, participant2_id);


-- ---------- B. MESSAGES hardening ----------

-- Recreate UPDATE policy with strict with_check
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
CREATE POLICY "Users can update messages in their conversations"
ON public.messages
FOR UPDATE
USING (public.is_conversation_participant(auth.uid(), conversation_id))
WITH CHECK (public.is_conversation_participant(auth.uid(), conversation_id));

-- Guard trigger: enforce block, lock immutable fields, validate type/length
CREATE OR REPLACE FUNCTION public.guard_message_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p1 uuid;
  _p2 uuid;
  _other uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF _uid IS NULL THEN
      -- Service role / system insert: allow
      RETURN NEW;
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

    -- Block check (either direction, both tables)
    IF EXISTS (
      SELECT 1 FROM public.user_blocks
       WHERE (blocker_id = _uid    AND blocked_id = _other)
          OR (blocker_id = _other  AND blocked_id = _uid)
    ) OR EXISTS (
      SELECT 1 FROM public.blocked_users
       WHERE (blocker_id = _uid    AND blocked_id = _other)
          OR (blocker_id = _other  AND blocked_id = _uid)
    ) THEN
      RAISE EXCEPTION 'You cannot message a user you have blocked or who has blocked you';
    END IF;

    -- Validate message type
    IF NEW.message_type IS NULL THEN
      NEW.message_type := 'text';
    END IF;
    IF NEW.message_type NOT IN ('text','image','video','audio','gift','sticker','emoji','file','system','call') THEN
      RAISE EXCEPTION 'Invalid message_type: %', NEW.message_type;
    END IF;

    -- Cap content length
    IF NEW.content IS NOT NULL AND length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'Message content exceeds 4000 character limit';
    END IF;

    -- Force trusted defaults
    NEW.created_at := now();
    NEW.is_read := false;
    NEW.is_deleted := false;
    NEW.status := COALESCE(NEW.status, 'sent');
    NEW.read_at := NULL;
    NEW.delivered_at := NULL;
    NEW.is_ai_reply := COALESCE(NEW.is_ai_reply, false);

    RETURN NEW;
  END IF;

  -- UPDATE branch
  IF _uid IS NULL THEN
    RETURN NEW; -- service-role / system path
  END IF;

  -- Lock immutable identity / content fields
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
    IF NOT public.is_admin(_uid) THEN
      RAISE EXCEPTION 'Cannot modify message identity fields';
    END IF;
  END IF;

  -- Content changes: only sender, only when soft-deleting
  IF COALESCE(NEW.content,'') <> COALESCE(OLD.content,'') THEN
    IF _uid <> OLD.sender_id AND NOT public.is_admin(_uid) THEN
      RAISE EXCEPTION 'Only the sender can modify message content';
    END IF;
    -- Allow content clear when soft-deleting
    IF NOT COALESCE(NEW.is_deleted,false) AND NOT public.is_admin(_uid) THEN
      RAISE EXCEPTION 'Message content can only be cleared when deleting';
    END IF;
  END IF;

  -- is_deleted: only sender (or admin) can flip true; cannot un-delete
  IF COALESCE(NEW.is_deleted,false) <> COALESCE(OLD.is_deleted,false) THEN
    IF _uid <> OLD.sender_id AND NOT public.is_admin(_uid) THEN
      RAISE EXCEPTION 'Only sender can delete their message';
    END IF;
    IF COALESCE(OLD.is_deleted,false) AND NOT public.is_admin(_uid) THEN
      RAISE EXCEPTION 'Cannot un-delete a message';
    END IF;
  END IF;

  -- is_read / read_at / delivered_at / status: recipient or sender allowed, but
  -- only recipient should flip is_read true. We allow either side to advance status.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_fields_trg ON public.messages;
CREATE TRIGGER guard_message_fields_trg
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.guard_message_fields();


-- ---------- C. Unify legacy block tables ----------

-- Mirror inserts blocked_users -> user_blocks
CREATE OR REPLACE FUNCTION public.sync_block_tables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'blocked_users' THEN
      INSERT INTO public.user_blocks (blocker_id, blocked_id)
      VALUES (NEW.blocker_id, NEW.blocked_id)
      ON CONFLICT DO NOTHING;
    ELSIF TG_TABLE_NAME = 'user_blocks' THEN
      INSERT INTO public.blocked_users (blocker_id, blocked_id)
      VALUES (NEW.blocker_id, NEW.blocked_id)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'blocked_users' THEN
      DELETE FROM public.user_blocks
       WHERE blocker_id = OLD.blocker_id AND blocked_id = OLD.blocked_id;
    ELSIF TG_TABLE_NAME = 'user_blocks' THEN
      DELETE FROM public.blocked_users
       WHERE blocker_id = OLD.blocker_id AND blocked_id = OLD.blocked_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Ensure both tables have unique (blocker_id, blocked_id) for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS blocked_users_pair_uniq ON public.blocked_users (blocker_id, blocked_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_pair_uniq    ON public.user_blocks    (blocker_id, blocked_id);

DROP TRIGGER IF EXISTS sync_blocked_users_trg ON public.blocked_users;
CREATE TRIGGER sync_blocked_users_trg
AFTER INSERT OR DELETE ON public.blocked_users
FOR EACH ROW EXECUTE FUNCTION public.sync_block_tables();

DROP TRIGGER IF EXISTS sync_user_blocks_trg ON public.user_blocks;
CREATE TRIGGER sync_user_blocks_trg
AFTER INSERT OR DELETE ON public.user_blocks
FOR EACH ROW EXECUTE FUNCTION public.sync_block_tables();

-- Backfill: mirror existing rows both directions
INSERT INTO public.user_blocks (blocker_id, blocked_id)
SELECT blocker_id, blocked_id FROM public.blocked_users
ON CONFLICT DO NOTHING;

INSERT INTO public.blocked_users (blocker_id, blocked_id)
SELECT blocker_id, blocked_id FROM public.user_blocks
ON CONFLICT DO NOTHING;


-- ---------- D. chat_moderation_logs: remove open client INSERT ----------

DROP POLICY IF EXISTS "Authenticated users can insert moderation logs" ON public.chat_moderation_logs;
-- (Edge functions use service role; admins keep ALL via existing policies.)
