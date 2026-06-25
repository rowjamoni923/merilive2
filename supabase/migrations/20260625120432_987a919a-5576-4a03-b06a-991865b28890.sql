
CREATE OR REPLACE FUNCTION public.find_reconnectable_random_call(p_user_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_window_secs INT;
  v_s RECORD;
BEGIN
  SELECT COALESCE(reconnect_window_seconds, 15) INTO v_window_secs
    FROM public.random_call_settings WHERE id = 1;

  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE settled = false
      AND (caller_id = p_user_id OR host_id = p_user_id)
      AND (
        -- Explicit disconnect window still open
        (caller_id = p_user_id AND caller_reconnect_until IS NOT NULL AND caller_reconnect_until > now())
        OR (host_id = p_user_id AND host_reconnect_until IS NOT NULL AND host_reconnect_until > now())
        -- Or session is still fresh (implicit reconnect grace)
        OR updated_at > now() - (v_window_secs || ' seconds')::INTERVAL
      )
    ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object(
    'found', true,
    'session_id', v_s.id,
    'room', v_s.livekit_room,
    'role', CASE WHEN p_user_id = v_s.caller_id THEN 'caller' ELSE 'host' END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
