-- Enable Realtime for random_call_broadcasts (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'random_call_broadcasts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.random_call_broadcasts';
  END IF;
END $$;

ALTER TABLE public.random_call_broadcasts REPLICA IDENTITY FULL;