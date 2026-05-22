UPDATE public.app_settings
SET setting_value = (
  CASE
    WHEN setting_value IS NULL OR btrim(setting_value) = '' THEN '{"noise_cancellation": false}'
    ELSE (COALESCE(NULLIF(btrim(setting_value), '')::jsonb, '{}'::jsonb) || jsonb_build_object('noise_cancellation', false))::text
  END
)
WHERE setting_key = 'livekit_signaling_enabled'
  AND NOT (COALESCE(NULLIF(btrim(setting_value), '')::jsonb, '{}'::jsonb) ? 'noise_cancellation');

INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'livekit_signaling_enabled', '{"noise_cancellation": false}', 'LiveKit signaling feature kill-switches'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled');