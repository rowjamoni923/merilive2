-- live_streams: add missing columns
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS total_coins_earned integer DEFAULT 0;

-- reels: add missing columns that code expects
-- Code uses view_count but DB has views_count, etc.
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beans_earned integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;

-- Copy existing data from views_count -> view_count, likes_count -> like_count
UPDATE public.reels SET view_count = COALESCE(views_count, 0), like_count = COALESCE(likes_count, 0) WHERE view_count = 0 OR like_count = 0;

-- stream_viewers: add is_active for tracking
ALTER TABLE public.stream_viewers
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;