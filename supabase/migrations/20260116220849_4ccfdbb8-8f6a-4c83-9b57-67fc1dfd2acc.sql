-- Add icon_url and display_name columns to level_animations table
ALTER TABLE public.level_animations 
ADD COLUMN IF NOT EXISTS icon_url TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.level_animations.icon_url IS 'URL to level icon/logo image (GIF, WebP, PNG supported)';
COMMENT ON COLUMN public.level_animations.display_name IS 'Custom display name for the level';