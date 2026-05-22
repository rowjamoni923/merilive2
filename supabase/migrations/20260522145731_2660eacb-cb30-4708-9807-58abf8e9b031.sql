
ALTER TABLE public.livekit_moderation_log
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS actor_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_livekit_moderation_log_room_created
  ON public.livekit_moderation_log(room_name, created_at DESC);

-- Add `moderation` kill-switch (default ON) to existing JSON blob
UPDATE public.app_settings
SET setting_value = (
  CASE
    WHEN setting_value IS NULL OR setting_value = '' THEN '{"moderation": true}'
    WHEN (setting_value::jsonb) ? 'moderation' THEN setting_value
    ELSE ((setting_value::jsonb) || '{"moderation": true}'::jsonb)::text
  END
)
WHERE setting_key = 'livekit_signaling_enabled';
