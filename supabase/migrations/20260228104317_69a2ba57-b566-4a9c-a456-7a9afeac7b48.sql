
-- 1) Switch media provider back to Agora
UPDATE public.app_settings
SET setting_value = '"agora"'::jsonb,
    updated_at = now()
WHERE setting_key = 'media_provider';

-- 2) Force-stop all currently active live streams for clean restart with Agora
UPDATE public.live_streams
SET is_active = false,
    ended_at = now(),
    viewer_count = 0
WHERE is_active = true;

-- 3) Mark all active stream viewers as left
UPDATE public.stream_viewers
SET left_at = now()
WHERE left_at IS NULL;

-- 4) Trigger global app re-entry so all users reconnect with Agora
UPDATE public.app_settings
SET setting_value = jsonb_build_object(
      'nonce', extract(epoch from now())::bigint,
      'reason', 'switch_to_agora',
      'created_at', now()
    ),
    updated_at = now()
WHERE setting_key = 'global_app_reentry';
