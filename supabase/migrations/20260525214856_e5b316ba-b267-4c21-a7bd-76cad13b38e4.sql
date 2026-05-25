-- Disable all user/host-facing LiveKit recording/egress switches.
UPDATE public.app_settings
SET setting_value = (
  COALESCE(setting_value::jsonb, '{}'::jsonb)
  || jsonb_build_object(
    'egress', false,
    'auto_record', false,
    'hls_egress', false,
    'track_egress', false,
    'stream_egress', false
  )
)::text
WHERE setting_key = 'livekit_signaling_enabled'
  AND setting_value IS NOT NULL
  AND setting_value ~ '^\s*\{';

INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'livekit_signaling_enabled', jsonb_build_object(
  'egress', false,
  'auto_record', false,
  'hls_egress', false,
  'track_egress', false,
  'stream_egress', false
)::text
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled'
);

-- Turn off every existing host auto-record preference.
UPDATE public.profiles
SET auto_record_live = false
WHERE COALESCE(auto_record_live, false) = true;

-- Remove the server-side trigger that silently starts recording after a live_stream row is created.
DROP TRIGGER IF EXISTS trg_auto_record_on_stream_start ON public.live_streams;

-- Defense in depth: keep the trigger function name but make it a no-op if any old code reattaches it.
CREATE OR REPLACE FUNCTION public.tg_auto_record_on_stream_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;