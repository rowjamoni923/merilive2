-- Pkg35: Allow live-streaming hosts to receive private calls
-- Previously start_private_call rejected with 'host_busy_live' if the host had an active stream
-- and no stream context was passed. The product now requires hosts to receive calls from
-- ANY surface (homepage, search, profile, etc.) even while broadcasting. The host UI ends
-- the stream automatically before answering.

CREATE OR REPLACE FUNCTION public.start_private_call(p_caller_id uuid, p_receiver_id uuid, p_call_type text DEFAULT 'video'::text, p_context_stream_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_balance integer;
  _coins_per_minute integer;
  _host_level integer;
  _call_id uuid;
  _settings_text text;
  _settings jsonb;
  _level_rates jsonb;
  _default_rate integer := 2000;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _rate_entry jsonb;
  _pc_enabled text;
BEGIN
  IF p_caller_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ids');
  END IF;
  IF p_caller_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_call_self');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND is_host = true AND lower(COALESCE(host_status,'')) = 'approved' AND COALESCE(is_face_verified,false) = true) INTO _caller_is_live_host;
  IF _caller_is_live_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND is_host = true AND lower(COALESCE(host_status,'')) = 'approved' AND COALESCE(is_face_verified,false) = true) INTO _receiver_ok;
  IF NOT COALESCE(_receiver_ok,false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'receiver_not_callable_host');
  END IF;

  SELECT setting_value INTO _pc_enabled FROM public.app_settings WHERE setting_key = 'private_calls_enabled' LIMIT 1;
  IF _pc_enabled IS NOT NULL AND btrim(_pc_enabled) <> '' AND lower(btrim(_pc_enabled)) NOT IN ('true','1','yes','on') THEN
    RETURN jsonb_build_object('success', false, 'error', 'private_calls_disabled');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked,false) = true)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_blocked,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_blocked');
  END IF;

  IF EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id = p_caller_id AND blocked_id = p_receiver_id) OR (blocker_id = p_receiver_id AND blocked_id = p_caller_id))
     OR EXISTS (SELECT 1 FROM public.user_blocks WHERE (blocker_id = p_caller_id AND blocked_id = p_receiver_id) OR (blocker_id = p_receiver_id AND blocked_id = p_caller_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_blocked');
  END IF;

  -- Only block when host is in another active private call. Live-streaming alone no longer blocks.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_in_call,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
  END IF;

  -- Pkg35: Live-streaming hosts CAN receive calls. host_busy_live block removed.
  -- If a stream context is passed, just validate it belongs to the receiver (best-effort).
  IF p_context_stream_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = p_context_stream_id AND ls.host_id = p_receiver_id AND ls.ended_at IS NULL AND COALESCE(ls.is_active,true) = true AND lower(COALESCE(ls.status,'active')) = 'active') THEN
      -- Stream context invalid (already ended) — proceed as a normal call instead of failing.
      NULL;
    END IF;
  END IF;

  SELECT setting_value INTO _settings_text FROM public.app_settings WHERE setting_key = 'call_rates' LIMIT 1;
  IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
    BEGIN
      _settings := _settings_text::jsonb;
      _default_rate := COALESCE((_settings->>'default_rate')::integer, 2000);
      _level_rates := _settings->'level_rates';
    EXCEPTION WHEN OTHERS THEN
      _default_rate := 2000;
      _level_rates := NULL;
    END;
  END IF;

  SELECT host_level INTO _host_level FROM public.profiles WHERE id = p_receiver_id;
  _coins_per_minute := _default_rate;
  IF _level_rates IS NOT NULL AND _host_level IS NOT NULL THEN
    FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates) LOOP
      IF (_rate_entry->>'level')::integer = _host_level THEN
        _coins_per_minute := (_rate_entry->>'rate')::integer;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  _coins_per_minute := GREATEST(1, COALESCE(_coins_per_minute, _default_rate));

  SELECT COALESCE(coins,0)::integer INTO _caller_balance FROM public.profiles WHERE id = p_caller_id;
  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'required', _coins_per_minute, 'current', COALESCE(_caller_balance,0));
  END IF;

  INSERT INTO private_calls (caller_id, host_id, call_type, status, coins_per_minute)
  VALUES (p_caller_id, p_receiver_id, p_call_type, 'ringing', _coins_per_minute)
  RETURNING id INTO _call_id;

  UPDATE public.profiles SET is_in_call = true, current_call_id = _call_id WHERE id = p_caller_id;

  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$function$;