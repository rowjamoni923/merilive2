-- Pkg73: Single-device kick was silently broken because user_active_sessions
-- was NEVER added to the supabase_realtime publication. Realtime UPDATE
-- events on it therefore never fired → old device never received the
-- "another device logged in" signal → no forced logout.
-- Fix: add the table to publication + REPLICA IDENTITY FULL so UPDATE
-- payload includes the new session_id reliably.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_active_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_active_sessions';
  END IF;
END $$;

ALTER TABLE public.user_active_sessions REPLICA IDENTITY FULL;