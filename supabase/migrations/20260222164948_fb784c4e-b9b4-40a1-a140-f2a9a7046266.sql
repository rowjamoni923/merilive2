-- Add missing tables to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE helper_upgrade_requests;

-- Set REPLICA IDENTITY FULL for better realtime support
ALTER TABLE helper_upgrade_requests REPLICA IDENTITY FULL;