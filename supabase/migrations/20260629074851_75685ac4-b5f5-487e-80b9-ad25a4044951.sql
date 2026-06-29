-- Pkg-CallChatAudit: 7-day in-call chat persistence (Chamet/Tango parity)
-- Stores every InCallChat text bubble for moderation + audit, auto-prunes after 7 days.
-- Sender writes (best-effort) right before publishing LiveKit DataPacket.
-- Read access is restricted to the two call participants.

CREATE TABLE IF NOT EXISTS public.call_chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       UUID NOT NULL,
  message_id    TEXT NOT NULL,
  sender_id     UUID NOT NULL,
  receiver_id   UUID,
  message       TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  message_type  TEXT NOT NULL DEFAULT 'text',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT call_chat_messages_unique UNIQUE (call_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_call_chat_messages_call_id_created
  ON public.call_chat_messages (call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_chat_messages_sender
  ON public.call_chat_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_chat_messages_created_at
  ON public.call_chat_messages (created_at);

GRANT SELECT, INSERT ON public.call_chat_messages TO authenticated;
GRANT ALL ON public.call_chat_messages TO service_role;

ALTER TABLE public.call_chat_messages ENABLE ROW LEVEL SECURITY;

-- Only the sender may insert their own row, and only for a call they're a participant in.
DROP POLICY IF EXISTS "Sender can insert own message in own call" ON public.call_chat_messages;
CREATE POLICY "Sender can insert own message in own call"
  ON public.call_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.private_calls pc
      WHERE pc.id = call_id
        AND (pc.caller_id = auth.uid() OR pc.host_id = auth.uid())
    )
  );

-- Either participant (caller/host) of the call can read transcript.
DROP POLICY IF EXISTS "Participants can read call chat" ON public.call_chat_messages;
CREATE POLICY "Participants can read call chat"
  ON public.call_chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.private_calls pc
      WHERE pc.id = call_id
        AND (pc.caller_id = auth.uid() OR pc.host_id = auth.uid())
    )
  );

-- 7-day retention cleaner (called by existing pg_cron daily housekeeping).
CREATE OR REPLACE FUNCTION public.cleanup_call_chat_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.call_chat_messages
   WHERE created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_call_chat_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_call_chat_messages() TO service_role;

-- Schedule daily prune at 03:15 UTC. Idempotent (unschedules previous job with same name).
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-call-chat-messages-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'cleanup-call-chat-messages-daily',
  '15 3 * * *',
  $cron$SELECT public.cleanup_call_chat_messages();$cron$
);

COMMENT ON TABLE public.call_chat_messages IS
  'Pkg-CallChatAudit: 7-day rolling transcript of private call in-room chat. Sender writes before publishing LiveKit DataPacket. Auto-pruned by cleanup_call_chat_messages cron.';