-- Set REPLICA IDENTITY FULL on profiles for better real-time updates
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Also ensure live_streams has FULL replica identity
ALTER TABLE public.live_streams REPLICA IDENTITY FULL;