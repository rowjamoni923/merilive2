-- Add stream_viewers and stream_chat to realtime publication for instant viewer counts and chat
ALTER PUBLICATION supabase_realtime ADD TABLE stream_viewers;
ALTER PUBLICATION supabase_realtime ADD TABLE stream_chat;