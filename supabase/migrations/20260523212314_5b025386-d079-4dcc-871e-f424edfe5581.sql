ALTER TABLE public.chat_moderation_logs
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS detected_content text,
  ADD COLUMN IF NOT EXISTS is_auto_action boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_chat_moderation_logs_conversation_id
  ON public.chat_moderation_logs(conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_moderation_logs_group_id
  ON public.chat_moderation_logs(group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_moderation_logs_unreviewed
  ON public.chat_moderation_logs(created_at DESC)
  WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_moderation_logs_auto_action
  ON public.chat_moderation_logs(is_auto_action, created_at DESC);