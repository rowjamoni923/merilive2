-- Enable realtime updates for live stream viewer presence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'stream_viewers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_viewers;
  END IF;
END $$;

ALTER TABLE public.stream_viewers REPLICA IDENTITY FULL;