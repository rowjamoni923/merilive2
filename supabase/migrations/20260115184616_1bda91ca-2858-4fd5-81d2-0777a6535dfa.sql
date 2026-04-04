-- Add new columns to game_settings for external game support
ALTER TABLE public.game_settings 
ADD COLUMN IF NOT EXISTS game_url TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS game_type TEXT DEFAULT 'internal',
ADD COLUMN IF NOT EXISTS iframe_width INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS iframe_height INTEGER DEFAULT 400;

-- Add comments
COMMENT ON COLUMN public.game_settings.game_url IS 'External game URL for iframe embedding';
COMMENT ON COLUMN public.game_settings.logo_url IS 'Custom logo URL for the game';
COMMENT ON COLUMN public.game_settings.game_type IS 'Type of game: internal or external';
COMMENT ON COLUMN public.game_settings.iframe_width IS 'Width percentage for external game iframe';
COMMENT ON COLUMN public.game_settings.iframe_height IS 'Height in pixels for external game iframe';