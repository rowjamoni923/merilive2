-- Pkg72: LiveKit DataChannel Foundation — kill-switch settings seed
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'livekit_signaling_enabled',
  '{"call":true,"live":true,"party":true,"gift":true,"chat":true,"presence":true,"game":true,"pk":true}'::text,
  'Per-feature kill-switch for LiveKit DataPacket signaling (Pkg72-Pkg81 migration). Flip any key to false to instantly fall back to Supabase Realtime path for that feature.'
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = CASE
    WHEN public.app_settings.setting_value IS NULL
      OR public.app_settings.setting_value = ''
      OR public.app_settings.setting_value = 'null'
    THEN EXCLUDED.setting_value
    ELSE public.app_settings.setting_value
  END,
  description = EXCLUDED.description;