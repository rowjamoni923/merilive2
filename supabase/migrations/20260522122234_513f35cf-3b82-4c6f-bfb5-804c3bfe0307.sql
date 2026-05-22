-- Pkg99: LiveKit moderation audit log
CREATE TABLE IF NOT EXISTS public.livekit_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_token_role text,
  room_name text NOT NULL,
  participant_identity text,
  track_sid text,
  action text NOT NULL CHECK (action IN ('mute_track','unmute_track','remove_participant','disconnect_room','update_participant')),
  reason text,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  request_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.livekit_moderation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin session full access"
ON public.livekit_moderation_log
FOR ALL
USING (is_active_admin_session())
WITH CHECK (is_active_admin_session());

CREATE INDEX IF NOT EXISTS idx_livekit_mod_log_created ON public.livekit_moderation_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_livekit_mod_log_room ON public.livekit_moderation_log (room_name, created_at DESC);
