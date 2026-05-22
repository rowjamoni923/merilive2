UPDATE public.app_settings
SET setting_value = jsonb_set(setting_value::jsonb, '{e2ee}', 'true'::jsonb, true)::text,
    updated_at = now()
WHERE setting_key = 'livekit_signaling_enabled';