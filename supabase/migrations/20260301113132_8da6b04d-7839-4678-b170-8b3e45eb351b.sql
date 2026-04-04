-- Force stop all active streams
UPDATE public.live_streams 
SET is_active = false, ended_at = now() 
WHERE is_active = true;

-- Clear all stream viewers
DELETE FROM public.stream_viewers;

-- Trigger global app reload so all clients reconnect with new LiveKit URL
UPDATE public.app_settings 
SET setting_value = to_jsonb(extract(epoch from now()) * 1000)::jsonb
WHERE setting_key = 'global_app_reentry';
