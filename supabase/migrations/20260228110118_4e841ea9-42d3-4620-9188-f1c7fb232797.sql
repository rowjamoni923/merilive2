-- Add stream_chat to supabase_realtime publication for live chat real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_chat;
