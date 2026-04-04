-- 1) Force-stop all currently active live streams
UPDATE public.live_streams
SET is_active = false,
    ended_at = now(),
    viewer_count = 0
WHERE is_active = true;

-- 2) Mark all active stream viewers as left
UPDATE public.stream_viewers
SET left_at = now()
WHERE left_at IS NULL;

-- 3) Broadcast global app re-entry signal to all connected clients via app_settings realtime
UPDATE public.app_settings
SET setting_value = jsonb_build_object(
      'nonce', extract(epoch from now())::bigint,
      'reason', 'global_live_reset',
      'created_at', now()
    ),
    category = COALESCE(category, 'system'),
    description = COALESCE(description, 'Global app force re-entry signal'),
    updated_at = now()
WHERE setting_key = 'global_app_reentry';

INSERT INTO public.app_settings (setting_key, setting_value, category, description, created_at, updated_at)
SELECT
  'global_app_reentry',
  jsonb_build_object(
    'nonce', extract(epoch from now())::bigint,
    'reason', 'global_live_reset',
    'created_at', now()
  ),
  'system',
  'Global app force re-entry signal',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'global_app_reentry'
);