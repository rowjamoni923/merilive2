
-- Phase 6: Reconnect + Multi-Device Safety
ALTER TABLE public.random_call_sessions
  ADD COLUMN IF NOT EXISTS caller_device_id TEXT,
  ADD COLUMN IF NOT EXISTS host_device_id TEXT,
  ADD COLUMN IF NOT EXISTS caller_disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS host_disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caller_reconnect_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS host_reconnect_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconnect_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.random_call_queue
  ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rcq_user_active
  ON public.random_call_queue(user_id) WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_rcs_caller_active
  ON public.random_call_sessions(caller_id) WHERE settled = false;
CREATE INDEX IF NOT EXISTS idx_rcs_host_active
  ON public.random_call_sessions(host_id) WHERE settled = false;

-- Mark disconnect (sets reconnect window)
CREATE OR REPLACE FUNCTION public.mark_random_disconnect(
  p_session_id UUID,
  p_role TEXT          -- 'caller' | 'host'
) RETURNS jsonb AS $$
DECLARE
  v_s RECORD;
  v_settings RECORD;
  v_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_s.settled THEN RETURN jsonb_build_object('ok', false, 'error', 'already_settled'); END IF;

  SELECT reconnect_window_seconds INTO v_settings FROM public.random_call_settings WHERE id = 1;
  v_until := now() + (COALESCE(v_settings.reconnect_window_seconds, 15) || ' seconds')::INTERVAL;

  IF p_role = 'caller' THEN
    UPDATE public.random_call_sessions
      SET caller_disconnected_at = now(),
          caller_reconnect_until = v_until,
          updated_at = now()
      WHERE id = p_session_id;
  ELSIF p_role = 'host' THEN
    UPDATE public.random_call_sessions
      SET host_disconnected_at = now(),
          host_reconnect_until = v_until,
          updated_at = now()
      WHERE id = p_session_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'bad_role');
  END IF;

  RETURN jsonb_build_object('ok', true, 'reconnect_until', v_until);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.mark_random_disconnect(UUID, TEXT) TO authenticated, service_role;

-- Reconnect within window (registers new device_id, clears disconnect stamp)
CREATE OR REPLACE FUNCTION public.reconnect_random_call(
  p_session_id UUID,
  p_user_id UUID,
  p_device_id TEXT
) RETURNS jsonb AS $$
DECLARE
  v_s RECORD;
  v_role TEXT;
  v_window TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_s.settled THEN RETURN jsonb_build_object('ok', false, 'error', 'already_settled'); END IF;

  IF p_user_id = v_s.caller_id THEN
    v_role := 'caller'; v_window := v_s.caller_reconnect_until;
  ELSIF p_user_id = v_s.host_id THEN
    v_role := 'host'; v_window := v_s.host_reconnect_until;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_party');
  END IF;

  IF v_window IS NOT NULL AND v_window < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reconnect_window_expired');
  END IF;

  IF v_role = 'caller' THEN
    UPDATE public.random_call_sessions
      SET caller_device_id = p_device_id,
          caller_disconnected_at = NULL,
          caller_reconnect_until = NULL,
          reconnect_count = reconnect_count + 1,
          updated_at = now()
      WHERE id = p_session_id;
  ELSE
    UPDATE public.random_call_sessions
      SET host_device_id = p_device_id,
          host_disconnected_at = NULL,
          host_reconnect_until = NULL,
          reconnect_count = reconnect_count + 1,
          updated_at = now()
      WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'role', v_role,
    'session_id', v_s.id,
    'room', v_s.livekit_room,
    'caller_id', v_s.caller_id,
    'host_id', v_s.host_id,
    'coin_rate_per_min', v_s.coin_rate_per_min,
    'free_trial_seconds', v_s.free_trial_seconds,
    'min_billable_seconds', v_s.min_billable_seconds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.reconnect_random_call(UUID, UUID, TEXT) TO authenticated, service_role;

-- Find an active reconnectable session for a user
CREATE OR REPLACE FUNCTION public.find_reconnectable_random_call(p_user_id UUID)
RETURNS jsonb AS $$
DECLARE v_s RECORD;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE settled = false
      AND (caller_id = p_user_id OR host_id = p_user_id)
      AND (
        (caller_id = p_user_id AND caller_reconnect_until IS NOT NULL AND caller_reconnect_until > now())
        OR
        (host_id = p_user_id AND host_reconnect_until IS NOT NULL AND host_reconnect_until > now())
      )
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object(
    'found', true,
    'session_id', v_s.id,
    'room', v_s.livekit_room,
    'role', CASE WHEN p_user_id = v_s.caller_id THEN 'caller' ELSE 'host' END,
    'reconnect_until', CASE WHEN p_user_id = v_s.caller_id THEN v_s.caller_reconnect_until ELSE v_s.host_reconnect_until END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.find_reconnectable_random_call(UUID) TO authenticated, service_role;

-- Supersede any prior enqueue from a different device for the same user
CREATE OR REPLACE FUNCTION public.supersede_random_enqueue(
  p_user_id UUID,
  p_new_device_id TEXT
) RETURNS jsonb AS $$
DECLARE v_killed INT;
BEGIN
  WITH del AS (
    UPDATE public.random_call_queue
      SET status = 'cancelled', updated_at = now()
      WHERE user_id = p_user_id
        AND status = 'waiting'
        AND (device_id IS DISTINCT FROM p_new_device_id)
      RETURNING 1
  )
  SELECT COUNT(*) INTO v_killed FROM del;
  RETURN jsonb_build_object('ok', true, 'superseded', v_killed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.supersede_random_enqueue(UUID, TEXT) TO authenticated, service_role;
