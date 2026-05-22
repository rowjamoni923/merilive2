-- Pkg128: Move/Forward Participant audit table + kill-switch

CREATE TABLE IF NOT EXISTS public.livekit_participant_forwards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'host')),
  actor_user_id uuid NULL,
  admin_token_role text NULL,
  src_room text NOT NULL,
  dst_room text NOT NULL,
  participant_identity text NOT NULL,
  reason text NULL,
  success boolean NOT NULL DEFAULT false,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lk_participant_forwards_created_at
  ON public.livekit_participant_forwards (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lk_participant_forwards_src_room
  ON public.livekit_participant_forwards (src_room, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lk_participant_forwards_actor
  ON public.livekit_participant_forwards (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

ALTER TABLE public.livekit_participant_forwards ENABLE ROW LEVEL SECURITY;

-- Admin session has full access.
DROP POLICY IF EXISTS "Admin session full access" ON public.livekit_participant_forwards;
CREATE POLICY "Admin session full access"
  ON public.livekit_participant_forwards
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Hosts can read rows where they were the actor.
DROP POLICY IF EXISTS "Host reads own forward audits" ON public.livekit_participant_forwards;
CREATE POLICY "Host reads own forward audits"
  ON public.livekit_participant_forwards
  FOR SELECT
  USING (actor_type = 'host' AND actor_user_id = auth.uid());

-- Seed kill-switch (default OFF — admin opts in).
DO $$
DECLARE
  current_val jsonb;
BEGIN
  SELECT
    CASE
      WHEN setting_value IS NULL OR setting_value = '' THEN '{}'::jsonb
      ELSE setting_value::jsonb
    END
  INTO current_val
  FROM public.app_settings
  WHERE setting_key = 'livekit_signaling_enabled';

  IF current_val IS NULL THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('livekit_signaling_enabled', jsonb_build_object('forward_participant', false)::text);
  ELSIF NOT (current_val ? 'forward_participant') THEN
    UPDATE public.app_settings
    SET setting_value = (current_val || jsonb_build_object('forward_participant', false))::text
    WHERE setting_key = 'livekit_signaling_enabled';
  END IF;
END $$;
