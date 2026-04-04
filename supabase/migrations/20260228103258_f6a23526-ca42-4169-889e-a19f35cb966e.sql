
-- Force stop all active live streams for clean restart with new Agora credentials
UPDATE public.live_streams 
SET is_active = false, 
    ended_at = now(), 
    viewer_count = 0 
WHERE is_active = true;

-- Clear all active stream viewers
DELETE FROM public.stream_viewers 
WHERE left_at IS NULL;
