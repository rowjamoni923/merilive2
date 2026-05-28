INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'livekit_signaling_enabled',
  jsonb_build_object(
    'room_ops', true,
    'egress_ops', true,
    'ingress_ops', true,
    'sip_ops', true,
    'agent_ops', true,
    'webhook_events_ops', true
  )::text,
  'LiveKit admin ops kill switches',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = jsonb_build_object(
      'room_ops', true,
      'egress_ops', true,
      'ingress_ops', true,
      'sip_ops', true,
      'agent_ops', true,
      'webhook_events_ops', true
    )::text,
    updated_at = now();