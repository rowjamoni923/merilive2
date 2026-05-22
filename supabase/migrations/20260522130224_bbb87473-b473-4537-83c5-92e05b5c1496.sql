UPDATE public.app_settings
SET setting_value = jsonb_set(
  COALESCE(setting_value::jsonb, '{}'::jsonb),
  '{sip}',
  'false'::jsonb,
  true
)::text
WHERE setting_key = 'livekit_signaling_enabled';

CREATE TABLE IF NOT EXISTS public.sip_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id uuid NOT NULL,
  stream_id uuid,
  room_name text NOT NULL,
  phone_number text NOT NULL,
  sip_participant_id text,
  sip_call_id text,
  status text NOT NULL DEFAULT 'initiated',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sip_call_log_initiator ON public.sip_call_log(initiator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sip_call_log_room ON public.sip_call_log(room_name);

ALTER TABLE public.sip_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sip_call_log_owner_select"
  ON public.sip_call_log FOR SELECT
  USING (auth.uid() = initiator_id);

CREATE POLICY "sip_call_log_admin_all"
  ON public.sip_call_log FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());