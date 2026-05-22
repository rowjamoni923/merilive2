-- Pkg139: Admin LiveKit Agent Dispatch Ops
-- Audit table + kill-switch for admin-only read/cancel of LiveKit Agent dispatches.

CREATE TABLE IF NOT EXISTS public.livekit_agent_ops_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_role text,
  action text NOT NULL,
  room_name text,
  dispatch_id text,
  agent_name text,
  result_count integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_livekit_agent_ops_log_created_at
  ON public.livekit_agent_ops_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_livekit_agent_ops_log_room
  ON public.livekit_agent_ops_log (room_name, created_at DESC);

ALTER TABLE public.livekit_agent_ops_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.livekit_agent_ops_log;
CREATE POLICY "Admin session full access"
ON public.livekit_agent_ops_log
FOR ALL
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

-- Seed agent_ops:false into livekit_signaling_enabled (idempotent JSON merge)
DO $$
DECLARE
  cur text;
  parsed jsonb;
BEGIN
  SELECT setting_value INTO cur
    FROM public.app_settings
   WHERE setting_key = 'livekit_signaling_enabled';
  IF cur IS NULL OR btrim(cur) = '' THEN
    parsed := '{}'::jsonb;
  ELSE
    BEGIN
      parsed := cur::jsonb;
    EXCEPTION WHEN others THEN
      parsed := '{}'::jsonb;
    END;
  END IF;

  IF NOT (parsed ? 'agent_ops') THEN
    parsed := parsed || jsonb_build_object('agent_ops', false);
    INSERT INTO public.app_settings (setting_key, setting_value, description)
    VALUES ('livekit_signaling_enabled', parsed::text,
            'LiveKit per-feature kill switches (Pkg72+). agent_ops added by Pkg139.')
    ON CONFLICT (setting_key) DO UPDATE
      SET setting_value = EXCLUDED.setting_value;
  END IF;
END $$;