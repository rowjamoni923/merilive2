UPDATE public.app_settings
SET setting_value = jsonb_set(setting_value::jsonb, '{ingress}', 'true'::jsonb)::text,
    updated_at = now()
WHERE setting_key = 'livekit_signaling_enabled';