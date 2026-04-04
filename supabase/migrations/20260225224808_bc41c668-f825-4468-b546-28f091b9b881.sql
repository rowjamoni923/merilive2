-- Add live_bans to realtime publication for instant ban/unban updates
ALTER PUBLICATION supabase_realtime ADD TABLE live_bans;
ALTER TABLE live_bans REPLICA IDENTITY FULL;