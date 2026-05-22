-- Pkg115: LiveKit SIP Inbound (PSTN callers → room participant)

CREATE TABLE IF NOT EXISTS public.sip_inbound_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  trunk_id TEXT,
  dispatch_rule_id TEXT,
  phone_numbers TEXT[] NOT NULL DEFAULT '{}',
  -- Where the caller is dropped. Either a fixed room or a per-call individual room.
  room_name TEXT,
  room_prefix TEXT,
  rule_type TEXT NOT NULL DEFAULT 'direct',     -- direct | individual
  participant_identity_prefix TEXT NOT NULL DEFAULT 'sip_',
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sip_inbound_routes_enabled ON public.sip_inbound_routes(enabled);

ALTER TABLE public.sip_inbound_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin session full access sip_inbound_routes"
ON public.sip_inbound_routes
FOR ALL
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.sip_inbound_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID REFERENCES public.sip_inbound_routes(id) ON DELETE SET NULL,
  trunk_id TEXT,
  caller_number TEXT,
  callee_number TEXT,
  room_name TEXT,
  stream_id UUID REFERENCES public.live_streams(id) ON DELETE SET NULL,
  host_id UUID,
  participant_identity TEXT,
  sip_call_id TEXT,
  status TEXT NOT NULL DEFAULT 'ringing',     -- ringing | answered | ended | failed
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sip_inbound_calls_route ON public.sip_inbound_calls(route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sip_inbound_calls_room ON public.sip_inbound_calls(room_name);
CREATE INDEX IF NOT EXISTS idx_sip_inbound_calls_host ON public.sip_inbound_calls(host_id, created_at DESC);

ALTER TABLE public.sip_inbound_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin session full access sip_inbound_calls"
ON public.sip_inbound_calls
FOR ALL
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

-- Host of the target stream can read calls that arrived into their own room.
CREATE POLICY "Host reads own room sip inbound calls"
ON public.sip_inbound_calls
FOR SELECT
USING (host_id IS NOT NULL AND host_id = auth.uid());

-- Add sip_inbound kill-switch (default false; admin opts in).
UPDATE public.app_settings
SET setting_value = (
  CASE
    WHEN setting_value IS NULL OR setting_value = '' THEN '{"sip_inbound": false}'::text
    ELSE (
      COALESCE(setting_value::jsonb, '{}'::jsonb) || jsonb_build_object('sip_inbound', false)
    )::text
  END
)
WHERE setting_key = 'livekit_signaling_enabled'
  AND (setting_value::jsonb ? 'sip_inbound') IS NOT TRUE;