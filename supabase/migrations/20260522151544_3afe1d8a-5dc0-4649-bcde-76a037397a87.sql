
-- Pkg130: LiveKit participant permission update audit + kill-switch
CREATE TABLE IF NOT EXISTS public.livekit_permission_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin','host')),
  actor_user_id uuid,
  admin_token_role text,
  room_name text NOT NULL,
  participant_identity text NOT NULL,
  permission jsonb NOT NULL,
  reason text,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lk_perm_updates_room_created
  ON public.livekit_permission_updates (room_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lk_perm_updates_actor
  ON public.livekit_permission_updates (actor_user_id, created_at DESC);

ALTER TABLE public.livekit_permission_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lk_perm_updates_admin_all" ON public.livekit_permission_updates;
CREATE POLICY "lk_perm_updates_admin_all"
  ON public.livekit_permission_updates
  FOR ALL
  USING (is_active_admin_session())
  WITH CHECK (is_active_admin_session());

DROP POLICY IF EXISTS "lk_perm_updates_host_own_read" ON public.livekit_permission_updates;
CREATE POLICY "lk_perm_updates_host_own_read"
  ON public.livekit_permission_updates
  FOR SELECT
  USING (actor_user_id = auth.uid());

-- Register the kill-switch (default OFF). Idempotent JSON merge.
UPDATE public.app_settings
SET setting_value = (
  CASE
    WHEN (setting_value::jsonb) ? 'update_permission'
      THEN setting_value::jsonb
    ELSE (setting_value::jsonb) || jsonb_build_object('update_permission', false)
  END
)::text
WHERE setting_key = 'livekit_signaling_enabled';

INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'livekit_signaling_enabled', jsonb_build_object('update_permission', false)::text
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled'
);
