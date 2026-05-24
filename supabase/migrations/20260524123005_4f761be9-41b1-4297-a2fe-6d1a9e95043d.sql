DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_streams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams;
  END IF;
END $$;