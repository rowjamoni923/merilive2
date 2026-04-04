-- Enable real-time for stream_chat table so ALL users can see messages from ALL participants
ALTER PUBLICATION supabase_realtime ADD TABLE stream_chat;