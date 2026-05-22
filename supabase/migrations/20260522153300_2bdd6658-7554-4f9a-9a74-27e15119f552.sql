-- Pkg134: LiveKit MoveParticipant — atomic move (vs Pkg128 forward = duplicate).
-- Adds:
--   1. `move_participant` kill-switch under livekit_signaling_enabled (default OFF).
--   2. `livekit_participant_moves` audit table (host reads own actor rows; admin all).

-- ─── Kill-switch ──────────────────────────────────────────────────────────
UPDATE public.app_settings
SET setting_value = (
  COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object('move_participant', false)
)::text
WHERE setting_key = 'livekit_signaling_enabled'
  AND NOT (
    COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb) ? 'move_participant'
  );

INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'livekit_signaling_enabled', '{"move_participant": false}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled'
);

-- ─── Audit table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.livekit_participant_moves (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('admin','host')),
  actor_user_id   UUID NULL,
  admin_token_role TEXT NULL,
  src_room        TEXT NOT NULL,
  dst_room        TEXT NOT NULL,
  participant_identity TEXT NOT NULL,
  reason          TEXT NULL,
  success         BOOLEAN NOT NULL DEFAULT false,
  error_message   TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_livekit_participant_moves_created_at
  ON public.livekit_participant_moves(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_livekit_participant_moves_src_room
  ON public.livekit_participant_moves(src_room);
CREATE INDEX IF NOT EXISTS idx_livekit_participant_moves_actor
  ON public.livekit_participant_moves(actor_user_id, created_at DESC);

ALTER TABLE public.livekit_participant_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.livekit_participant_moves;
CREATE POLICY "Admin session full access"
  ON public.livekit_participant_moves
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

DROP POLICY IF EXISTS "Host can read own move actions" ON public.livekit_participant_moves;
CREATE POLICY "Host can read own move actions"
  ON public.livekit_participant_moves
  FOR SELECT
  USING (actor_user_id = auth.uid());