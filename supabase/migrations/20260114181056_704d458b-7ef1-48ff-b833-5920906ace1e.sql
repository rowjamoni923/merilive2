-- Enable REPLICA IDENTITY FULL for notifications table for realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Add notifications to realtime publication (create if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;