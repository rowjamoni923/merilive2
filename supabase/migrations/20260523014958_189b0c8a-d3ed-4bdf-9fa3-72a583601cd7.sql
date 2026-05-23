UPDATE app_settings
SET setting_value = (
  setting_value::jsonb
    || '{"stream_egress": false, "ingress": false}'::jsonb
)::text,
updated_at = now()
WHERE setting_key = 'livekit_signaling_enabled';