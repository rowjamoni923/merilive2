-- Add face_verification_submissions to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE face_verification_submissions;
ALTER TABLE face_verification_submissions REPLICA IDENTITY FULL;

-- Add helper_applications to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE helper_applications;
ALTER TABLE helper_applications REPLICA IDENTITY FULL;

-- Add helper_topup_requests to realtime publication  
ALTER PUBLICATION supabase_realtime ADD TABLE helper_topup_requests;
ALTER TABLE helper_topup_requests REPLICA IDENTITY FULL;

-- support_tickets already in publication, just set replica identity
ALTER TABLE support_tickets REPLICA IDENTITY FULL;

-- Add agency_withdrawals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'agency_withdrawals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agency_withdrawals;
  END IF;
END $$;
ALTER TABLE agency_withdrawals REPLICA IDENTITY FULL;

-- Add helper_message_replies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'helper_message_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE helper_message_replies;
  END IF;
END $$;
ALTER TABLE helper_message_replies REPLICA IDENTITY FULL;

-- Add admin_notices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_notices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_notices;
  END IF;
END $$;
ALTER TABLE admin_notices REPLICA IDENTITY FULL;

-- Add notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
ALTER TABLE notifications REPLICA IDENTITY FULL;