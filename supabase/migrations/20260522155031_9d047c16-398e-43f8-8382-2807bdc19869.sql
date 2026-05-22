CREATE TABLE IF NOT EXISTS public.livekit_ingress_ops_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_role text NOT NULL,
  action text NOT NULL,
  ingress_id text,
  room_name text,
  result_count integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_livekit_ingress_ops_log_created_at
  ON public.livekit_ingress_ops_log (created_at DESC);

ALTER TABLE public.livekit_ingress_ops_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access"
  ON public.livekit_ingress_ops_log;
CREATE POLICY "Admin session full access"
  ON public.livekit_ingress_ops_log
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Seed kill-switch (idempotent merge)
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'livekit_signaling_enabled',
  jsonb_build_object('ingress_ops', false)::text,
  'LiveKit per-feature kill-switches (Pkg72+)'
)
ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = (
    COALESCE(public.app_settings.setting_value::jsonb, '{}'::jsonb)
    || jsonb_build_object('ingress_ops', COALESCE((public.app_settings.setting_value::jsonb ->> 'ingress_ops')::boolean, false))
  )::text;
