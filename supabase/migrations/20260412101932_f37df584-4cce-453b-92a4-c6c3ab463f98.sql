CREATE OR REPLACE FUNCTION public.cleanup_application_logs() RETURNS TABLE(system_error_logs_deleted bigint, session_security_logs_deleted bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_system_deleted bigint := 0;
  v_session_deleted bigint := 0;
BEGIN
  DELETE FROM public.system_error_logs
  WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_system_deleted = ROW_COUNT;

  DELETE FROM public.session_security_logs
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_system_deleted, v_session_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.email_otps 
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_recordings() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE stream_recordings
  SET status = 'expired'
  WHERE expires_at < now() AND status = 'ready';
  DELETE FROM stream_recordings
  WHERE expires_at < (now() - interval '30 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_tokens() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM recovery_tokens WHERE expires_at < now() OR is_used = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
  DELETE FROM public.failed_login_attempts WHERE last_attempt_at < now() - interval '24 hours';
  DELETE FROM public.blocked_ips WHERE expires_at < now() AND is_permanent = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_login_attempts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempt_at < now() - interval '24 hours';
  DELETE FROM account_lockouts WHERE locked_until < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_security_alerts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.security_alerts
  WHERE is_resolved = true AND resolved_at < now() - interval '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts WHERE attempted_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_data() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '10s'
    AS $$
BEGIN
  UPDATE profiles SET is_online = false WHERE is_online = true AND last_active_at < NOW() - INTERVAL '5 minutes';
  UPDATE live_streams SET is_active = false, ended_at = NOW() WHERE is_active = true AND last_heartbeat < NOW() - INTERVAL '3 minutes';
  UPDATE device_tokens SET is_active = false WHERE is_active = true AND updated_at < NOW() - INTERVAL '90 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_in_call_flags() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE profiles p SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc WHERE p.current_call_id = pc.id AND p.is_in_call = true AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');

  UPDATE profiles p SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE p.is_in_call = true AND p.current_call_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM private_calls pc WHERE pc.id = p.current_call_id);

  UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected' AND started_at < now() - INTERVAL '30 seconds' AND ended_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.current_call_id = private_calls.id AND p.is_in_call = true AND p.last_seen_at > now() - INTERVAL '60 seconds');

  UPDATE private_calls SET status = 'missed', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status IN ('ringing', 'pending') AND started_at < now() - INTERVAL '60 seconds' AND ended_at IS NULL;

  UPDATE profiles SET is_in_call = false, updated_at = now() WHERE is_in_call = true AND current_call_id IS NULL;

  UPDATE profiles p SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc WHERE p.current_call_id = pc.id AND p.is_in_call = true AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET statement_timeout TO '5s'
    SET search_path TO 'public'
    AS $$
DECLARE closed_count integer;
BEGIN
  UPDATE live_streams SET is_active = false, ended_at = now() WHERE is_active = true AND last_heartbeat < now() - interval '60 seconds';
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE private_calls SET status = 'missed', ended_at = now(), end_reason = 'timeout' WHERE status = 'ringing' AND created_at < now() - interval '60 seconds';
  UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup' WHERE status = 'connected' AND started_at < now() - interval '2 hours';
  UPDATE profiles SET is_in_call = false, current_call_id = NULL WHERE is_in_call = true AND id NOT IN (SELECT caller_id FROM private_calls WHERE status IN ('ringing', 'connected') UNION SELECT host_id FROM private_calls WHERE status IN ('ringing', 'connected'));
  UPDATE profiles SET is_online = false WHERE is_online = true AND is_host = false AND last_seen_at < now() - interval '2 minutes';
  UPDATE profiles SET is_online = false WHERE is_online = true AND is_host = true AND last_seen_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stuck_calls() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE private_calls SET status = 'ended', ended_at = now() WHERE status IN ('connected', 'pending', 'ringing') AND started_at < now() - interval '10 minutes';
  UPDATE profiles SET is_in_call = false WHERE is_in_call = true AND id NOT IN (SELECT caller_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing') UNION SELECT host_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing'));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_live_game_round(_game_type text, _stream_id uuid, _betting_time integer DEFAULT 30) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _round_id UUID;
  _host_id UUID;
BEGIN
  SELECT host_id INTO _host_id FROM live_streams WHERE id = _stream_id AND is_active = true;
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Only stream host can create game rounds';
  END IF;
  IF EXISTS (SELECT 1 FROM live_game_rounds WHERE stream_id = _stream_id AND status IN ('betting', 'playing')) THEN
    RAISE EXCEPTION 'Active round already exists';
  END IF;
  INSERT INTO live_game_rounds (stream_id, game_type, status, betting_end_at)
  VALUES (_stream_id, _game_type, 'betting', now() + (_betting_time || ' seconds')::interval)
  RETURNING id INTO _round_id;
  RETURN _round_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(_user_id uuid, _title text, _message text, _type text DEFAULT 'general'::text, _data jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, title, message, type, data)
  VALUES (_user_id, _title, _message, _type, _data)
  RETURNING id INTO _notification_id;
  RETURN _notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT auth.uid() $$;