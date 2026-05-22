UPDATE app_settings
SET setting_value = (
  COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object('webhook_events_ops', false)
)::text
WHERE setting_key = 'livekit_signaling_enabled';

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT
  'livekit_signaling_enabled',
  '{"webhook_events_ops": false}'::text,
  'LiveKit per-feature kill switches'
WHERE NOT EXISTS (
  SELECT 1 FROM app_settings WHERE setting_key = 'livekit_signaling_enabled'
);