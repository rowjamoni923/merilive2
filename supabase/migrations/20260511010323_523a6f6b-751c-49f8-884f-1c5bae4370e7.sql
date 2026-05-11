
-- ============================================================
-- Pkg31: Reliable Call Delivery System
-- - call_delivery_log: track every FCM/WebSocket attempt
-- - call_delivery_settings: tunable knobs (max_retries, ring_timeout)
-- - mark_call_delivered RPC: phone confirms receipt
-- ============================================================

CREATE TABLE IF NOT EXISTS public.call_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  attempt_number int NOT NULL DEFAULT 1,
  channel text NOT NULL CHECK (channel IN ('fcm', 'realtime', 'websocket', 'sms_fallback')),
  fcm_token text,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'expired')),
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  device_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_delivery_call_id ON public.call_delivery_log(call_id);
CREATE INDEX IF NOT EXISTS idx_call_delivery_callee ON public.call_delivery_log(callee_id, created_at DESC);

ALTER TABLE public.call_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own delivery log"
  ON public.call_delivery_log FOR SELECT
  USING (callee_id = auth.uid());

CREATE POLICY "Admin session full access"
  ON public.call_delivery_log FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Tunable settings (loaded from app_settings; no hardcoded fallback in code)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('call_delivery_max_retries', '3'),
  ('call_delivery_retry_gap_ms', '2000'),
  ('call_ring_timeout_seconds', '30'),
  ('call_delivery_sms_fallback_enabled', 'false')
ON CONFLICT (setting_key) DO NOTHING;

-- RPC: phone marks notification as delivered
CREATE OR REPLACE FUNCTION public.mark_call_delivered(
  p_call_id uuid,
  p_channel text DEFAULT 'fcm',
  p_device_info jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  UPDATE public.call_delivery_log
     SET status = 'delivered',
         delivered_at = now(),
         device_info = COALESCE(p_device_info, device_info)
   WHERE call_id = p_call_id
     AND callee_id = v_uid
     AND status IN ('sent', 'queued');

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_call_delivered(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_call_delivered(uuid, text, jsonb) TO authenticated;
