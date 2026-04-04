
-- Add chat_moderation_logs to realtime publication for admin number sharing alerts
ALTER PUBLICATION supabase_realtime ADD TABLE chat_moderation_logs;
ALTER TABLE chat_moderation_logs REPLICA IDENTITY FULL;
