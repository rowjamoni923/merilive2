-- Pkg136: LiveKit Egress Ops (admin)
CREATE TABLE IF NOT EXISTS public.livekit_egress_ops_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_admin_role text NOT NULL,
  action text NOT NULL,
  egress_id text,
  room_name text,
  layout text,
  result_count integer,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_livekit_egress_ops_log_created
  ON public.livekit_egress_ops_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_livekit_egress_ops_log_egress
  ON public.livekit_egress_ops_log (egress_id, created_at DESC);

ALTER TABLE public.livekit_egress_ops_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.livekit_egress_ops_log;
CREATE POLICY "Admin session full access"
  ON public.livekit_egress_ops_log
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Seed Pkg136 kill-switch `egress_ops` (default OFF — admin opts in)
DO $$
DECLARE
  v_raw text;
  v_json jsonb;
BEGIN
  SELECT setting_value INTO v_raw
  FROM public.app_settings
  WHERE setting_key = 'livekit_signaling_enabled';

  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    v_json := '{}'::jsonb;
  ELSE
    BEGIN
      v_json := v_raw::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_json := '{}'::jsonb;
    END;
  END IF;

  IF NOT (v_json ? 'egress_ops') THEN
    v_json := v_json || jsonb_build_object('egress_ops', false);
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('livekit_signaling_enabled', v_json::text)
    ON CONFLICT (setting_key)
    DO UPDATE SET setting_value = EXCLUDED.setting_value;
  END IF;
END $$;