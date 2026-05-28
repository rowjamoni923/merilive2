UPDATE public.app_settings
SET setting_value = (
  COALESCE(setting_value::jsonb, '{}'::jsonb)
  || jsonb_build_object(
    'room_ops', true,
    'egress_ops', true,
    'ingress_ops', true,
    'sip_ops', true
  )
)::text
WHERE setting_key = 'livekit_signaling_enabled';