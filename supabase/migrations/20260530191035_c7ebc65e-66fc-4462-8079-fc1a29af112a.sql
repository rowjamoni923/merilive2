-- Set REPLICA IDENTITY FULL for more critical tables
-- This ensures all columns are included in Supabase Realtime payloads.
-- Note: views (like profiles_public) do not support replica identity.

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.face_verification_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.host_applications REPLICA IDENTITY FULL;
ALTER TABLE public.gift_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
