-- Make live_frame_alerts emit realtime events so admin dashboards can subscribe via postgres_changes.
ALTER TABLE public.live_frame_alerts REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_frame_alerts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_frame_alerts';
  END IF;
END$$;