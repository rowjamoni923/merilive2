-- Add unique constraint on setting_key
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_setting_key_unique UNIQUE (setting_key);

-- Add rating_popup_enabled setting
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES ('rating_popup_enabled', 'true', 'Enable/disable the rating popup banner')
ON CONFLICT (setting_key) DO NOTHING;

-- Fix old server URLs in app_settings
UPDATE public.app_settings 
SET setting_value = REPLACE(setting_value::text, 'pppcwawjjpwwrmvezcdy.supabase.co', 'ayjdlvuurscxucatbbah.supabase.co')
WHERE setting_value::text LIKE '%pppcwawjjpwwrmvezcdy%';