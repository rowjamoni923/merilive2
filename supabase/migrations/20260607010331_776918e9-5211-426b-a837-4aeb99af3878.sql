-- Helper: returns true if either user has blocked the other (checks both legacy tables)
CREATE OR REPLACE FUNCTION public.users_have_block(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  ) OR EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.users_have_block(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_have_block(uuid, uuid) TO authenticated, service_role;

-- Helper: returns true if the *other* participant of the conversation has blocked _sender
CREATE OR REPLACE FUNCTION public.is_dm_blocked(_sender uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = _conversation_id
      AND public.users_have_block(
            _sender,
            CASE WHEN c.participant1_id = _sender THEN c.participant2_id ELSE c.participant1_id END
          )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_dm_blocked(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dm_blocked(uuid, uuid) TO authenticated, service_role;

-- ===== messages: tighten INSERT (block check) and UPDATE (sender only) =====
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_conversation_participant(auth.uid(), conversation_id)
  AND NOT public.is_dm_blocked(auth.uid(), conversation_id)
);

DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
CREATE POLICY "Users can update their own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  auth.uid() = sender_id
  AND public.is_conversation_participant(auth.uid(), conversation_id)
)
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_conversation_participant(auth.uid(), conversation_id)
);

-- ===== conversations: block-aware creation =====
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = participant1_id OR auth.uid() = participant2_id)
  AND NOT public.users_have_block(participant1_id, participant2_id)
);