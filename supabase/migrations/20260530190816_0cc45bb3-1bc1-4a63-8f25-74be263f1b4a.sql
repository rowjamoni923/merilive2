-- Set REPLICA IDENTITY FULL for critical real-time tables
-- This ensures that UPDATE and DELETE events in Supabase Realtime 
-- contain the full row data, not just the primary key.
-- This is essential for the UI to update instantly without refetching.

ALTER TABLE public.live_streams REPLICA IDENTITY FULL;
ALTER TABLE public.party_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.private_calls REPLICA IDENTITY FULL;
ALTER TABLE public.seat_requests REPLICA IDENTITY FULL;
