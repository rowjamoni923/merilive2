-- Drop the existing restrictive UPDATE policy for messages
DROP POLICY IF EXISTS "Sender can update own messages" ON public.messages;

-- Create a new UPDATE policy that allows:
-- 1. Sender can update their own messages (edit content)
-- 2. Receiver (conversation participant) can mark messages as read
CREATE POLICY "Users can update messages in their conversations"
  ON public.messages
  FOR UPDATE
  USING (
    is_conversation_participant(auth.uid(), conversation_id)
  )
  WITH CHECK (
    is_conversation_participant(auth.uid(), conversation_id)
  );

-- Also add an index to improve query performance for unread messages
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON public.messages(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender ON public.messages(conversation_id, sender_id);