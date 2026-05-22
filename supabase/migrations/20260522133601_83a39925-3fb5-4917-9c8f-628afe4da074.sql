-- Pkg117: LiveKit Agents (Voice AI dispatch)
UPDATE public.app_settings
SET setting_value = (
  COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object('agent', false)
)::text
WHERE setting_key = 'livekit_signaling_enabled';

INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'livekit_signaling_enabled',
       jsonb_build_object('agent', false)::text,
       'LiveKit per-feature kill switches'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled'
);

CREATE TABLE IF NOT EXISTS public.agent_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('call','live','party')),
  scope_id text,
  room_name text NOT NULL,
  agent_name text NOT NULL,
  dispatch_id text,
  initiator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initiator_role text NOT NULL DEFAULT 'host' CHECK (initiator_role IN ('host','admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','failed','cancelled','ended')),
  metadata jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_dispatches_room ON public.agent_dispatches(room_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_initiator ON public.agent_dispatches(initiator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_scope ON public.agent_dispatches(scope, scope_id);

ALTER TABLE public.agent_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.agent_dispatches;
CREATE POLICY "Admin session full access" ON public.agent_dispatches
  FOR ALL USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session());

DROP POLICY IF EXISTS "Initiator reads own dispatches" ON public.agent_dispatches;
CREATE POLICY "Initiator reads own dispatches" ON public.agent_dispatches
  FOR SELECT USING (initiator_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_agent_dispatches_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agent_dispatches_touch ON public.agent_dispatches;
CREATE TRIGGER trg_agent_dispatches_touch
BEFORE UPDATE ON public.agent_dispatches
FOR EACH ROW EXECUTE FUNCTION public.tg_agent_dispatches_touch();