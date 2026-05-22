ALTER TABLE public.call_delivery_log
  DROP CONSTRAINT IF EXISTS call_delivery_log_channel_check;

ALTER TABLE public.call_delivery_log
  ADD CONSTRAINT call_delivery_log_channel_check
  CHECK (channel IN ('fcm', 'notification_insert', 'websocket', 'sms_fallback', 'native_poll', 'native_presented', 'native_action'));

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
  v_call record;
  v_updated integer := 0;
  v_channel text := COALESCE(NULLIF(trim(p_channel), ''), 'fcm');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT id, caller_id, host_id, status
    INTO v_call
    FROM public.private_calls
   WHERE id = p_call_id
   LIMIT 1;

  IF v_call IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'call_not_found');
  END IF;

  IF v_call.host_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_callee');
  END IF;

  IF v_channel NOT IN ('fcm', 'notification_insert', 'websocket', 'sms_fallback', 'native_poll', 'native_presented', 'native_action') THEN
    v_channel := 'fcm';
  END IF;

  UPDATE public.call_delivery_log
     SET status = 'delivered',
         delivered_at = now(),
         device_info = COALESCE(p_device_info, device_info)
   WHERE call_id = p_call_id
     AND callee_id = v_uid
     AND channel = v_channel
     AND status IN ('sent', 'queued', 'failed', 'no_tokens', 'skipped_no_fcm');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    INSERT INTO public.call_delivery_log (
      call_id, callee_id, attempt_number, channel, status, sent_at, delivered_at, device_info
    ) VALUES (
      p_call_id, v_uid, 0, v_channel, 'delivered', now(), now(), COALESCE(p_device_info, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'callId', p_call_id, 'channel', v_channel, 'status', v_call.status);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_call_delivered(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_call_delivered(uuid, text, jsonb) TO authenticated;