UPDATE app_settings
SET setting_value = (
  CASE
    WHEN setting_value IS NULL OR btrim(setting_value) = '' THEN
      '{"room_metadata": false}'
    ELSE
      (
        CASE
          WHEN (setting_value::jsonb ? 'room_metadata') THEN setting_value::jsonb
          ELSE setting_value::jsonb || '{"room_metadata": false}'::jsonb
        END
      )::text
  END
)
WHERE setting_key = 'livekit_signaling_enabled';

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'livekit_signaling_enabled', '{"room_metadata": false}', 'LiveKit per-feature kill switches'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'livekit_signaling_enabled');