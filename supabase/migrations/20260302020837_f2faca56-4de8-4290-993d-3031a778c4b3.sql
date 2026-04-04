
-- Add country_code column to app_event_themes
ALTER TABLE public.app_event_themes 
ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'GLOBAL';

-- Add index for fast country-based filtering
CREATE INDEX IF NOT EXISTS idx_app_event_themes_country_code 
ON public.app_event_themes(country_code);

-- Add composite index for active themes per country
CREATE INDEX IF NOT EXISTS idx_app_event_themes_country_active 
ON public.app_event_themes(country_code, is_active, display_order);
