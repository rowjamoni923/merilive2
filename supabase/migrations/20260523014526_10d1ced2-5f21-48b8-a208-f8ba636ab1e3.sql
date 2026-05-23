UPDATE app_settings
SET setting_value = (
  setting_value::jsonb
    || '{"egress": true, "stream_egress": true, "hls_egress": true, "track_egress": true, "auto_record": true}'::jsonb
)::text,
updated_at = now()
WHERE setting_key = 'livekit_signaling_enabled';