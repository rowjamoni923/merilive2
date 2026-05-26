-- Ensure REPLICA IDENTITY FULL so UPDATE/DELETE payloads include the full old row
ALTER TABLE public.reels REPLICA IDENTITY FULL;
ALTER TABLE public.reel_likes REPLICA IDENTITY FULL;
ALTER TABLE public.reel_comments REPLICA IDENTITY FULL;
ALTER TABLE public.reel_shares REPLICA IDENTITY FULL;

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reels; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_shares; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;