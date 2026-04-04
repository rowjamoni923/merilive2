-- Add animation_url column to user_level_tiers for GIF/animation support
ALTER TABLE public.user_level_tiers 
ADD COLUMN IF NOT EXISTS animation_url TEXT,
ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.user_level_tiers.animation_url IS 'URL to GIF or animation file for level badge';
COMMENT ON COLUMN public.user_level_tiers.icon_url IS 'URL to static icon/image for level badge';