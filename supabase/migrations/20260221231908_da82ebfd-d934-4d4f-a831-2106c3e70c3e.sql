-- Add helper_withdrawal_requests to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'helper_withdrawal_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE helper_withdrawal_requests;
  END IF;
END $$;
ALTER TABLE helper_withdrawal_requests REPLICA IDENTITY FULL;

-- Add helper_notifications to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'helper_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE helper_notifications;
  END IF;
END $$;
ALTER TABLE helper_notifications REPLICA IDENTITY FULL;