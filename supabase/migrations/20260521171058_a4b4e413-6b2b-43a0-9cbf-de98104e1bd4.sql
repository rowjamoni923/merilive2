CREATE OR REPLACE FUNCTION public.start_private_call(p_caller_id uuid, p_receiver_id uuid, p_call_type text DEFAULT 'video'::text, p_context_stream_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_balance bigint;
  _coins_per_minute bigint;
  _host_level integer;
  _host_custom_rate integer;
  _call_id uuid;
  _settings_text text;
  _settings jsonb;
  _level_rates jsonb;
  _default_rate integer;
  _timeout_seconds integer := 60;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _rate_entry jsonb;
  _pc_enabled text;
  _client_platform text;
  _client_ua text;
  _allow_web text;
  _is_native_client boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_caller_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ids');
  END IF;
  IF p_caller_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_call_self');
  END IF;

  BEGIN
    _client_platform := lower(coalesce(current_setting('request.headers', true)::json->>'x-client-platform',''));
  EXCEPTION WHEN OTHERS THEN _client_platform := ''; END;
  BEGIN
    _client_ua := lower(coalesce(current_setting('request.headers', true)::json->>'user-agent',''));
  EXCEPTION WHEN OTHERS THEN _client_ua := ''; END;
  _is_native_client := (
    _client_platform IN ('android-native','ios-native')
    OR position('merilive-android-native' in _client_ua) > 0
    OR position('merilive-ios-native' in _client_ua) > 0
    OR position('capacitor' in _client_ua) > 0
  );

  SELECT setting_value INTO _allow_web FROM public.app_settings WHERE setting_key = 'allow_web_calls' LIMIT 1;
  IF lower(coalesce(btrim(_allow_web),'false')) NOT IN ('true','1','yes','on') THEN
    IF NOT _is_native_client THEN
      RETURN jsonb_build_object('success', false, 'error', 'native_app_required', 'message', 'Private calls are available only in the MeriLive Android app.');
    END IF;
  END IF;

  SELECT setting_value INTO _settings_text FROM public.app_settings WHERE setting_key = 'call_rates' LIMIT 1;
  IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_rate_not_configured');
  END IF;
  BEGIN
    _settings := _settings_text::jsonb;
    _default_rate := NULLIF((_settings->>'default_rate')::integer, 0);
    _timeout_seconds := GREATEST(15, LEAST(120, COALESCE((_settings->>'call_timeout_seconds')::integer, 60)));
    _level_rates := _settings->'level_rates';
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_call_rate_config');
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- ✨ DEAD-FOREVER POLICY: When the caller initiates a NEW call, force-end every
  -- one of their previous pending/ringing/connected calls. This guarantees that
  -- pressing "Call" again after hanging up always produces a brand-new call row,
  -- never reuses or reconnects an old one (matches WhatsApp/IMO behavior).
  WITH callers_stale AS (
    UPDATE public.private_calls
       SET status = CASE WHEN status = 'connected' THEN 'ended' ELSE 'missed' END,
           ended_at = now(),
           end_reason = COALESCE(end_reason, 'superseded_by_new_call'),
           updated_at = now()
     WHERE status IN ('pending','ringing','connected')
       AND (caller_id = p_caller_id OR host_id = p_caller_id)
     RETURNING id, caller_id, host_id
  )
  UPDATE public.profiles p
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
    FROM callers_stale s
   WHERE p.id IN (s.caller_id, s.host_id);

  -- Also force-clear any RECEIVER row that's stuck busy but has no active call
  -- (e.g. the receiver hung up moments ago but their `is_in_call` flag lagged).
  WITH receivers_stale AS (
    UPDATE public.private_calls
       SET status = CASE WHEN status = 'connected' THEN 'ended' ELSE 'missed' END,
           ended_at = now(),
           end_reason = COALESCE(end_reason, 'superseded_by_new_call'),
           updated_at = now()
     WHERE status IN ('pending','ringing','connected')
       AND (caller_id = p_receiver_id OR host_id = p_receiver_id)
       AND ended_at IS NULL
       AND updated_at < now() - interval '2 seconds'
     RETURNING id, caller_id, host_id
  )
  UPDATE public.profiles p
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
    FROM receivers_stale s
   WHERE p.id IN (s.caller_id, s.host_id);

  -- Clean general expired/orphaned rows
  WITH expired AS (
    UPDATE public.private_calls
       SET status = 'missed', ended_at = now(), end_reason = 'timeout', updated_at = now()
     WHERE status IN ('pending', 'ringing')
       AND created_at < now() - make_interval(secs => _timeout_seconds)
       AND (caller_id IN (p_caller_id, p_receiver_id) OR host_id IN (p_caller_id, p_receiver_id))
     RETURNING caller_id, host_id, id
  )
  UPDATE public.profiles p
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
    FROM expired e
   WHERE p.id IN (e.caller_id, e.host_id)
     AND p.current_call_id = e.id;

  UPDATE public.profiles p
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE p.id IN (p_caller_id, p_receiver_id)
     AND p.current_call_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.private_calls pc
        WHERE pc.id = p.current_call_id
          AND pc.status IN ('pending', 'ringing', 'connected')
     );

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_caller_id AND is_host = true
       AND lower(COALESCE(host_status,'')) = 'approved'
       AND COALESCE(is_face_verified,false) = true
  ) INTO _caller_is_live_host;
  IF _caller_is_live_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_receiver_id AND is_host = true
       AND lower(COALESCE(host_status,'')) = 'approved'
       AND COALESCE(is_face_verified,false) = true
  ) INTO _receiver_ok;
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

  -- Note: after the auto-clean above, the caller is guaranteed not busy.
  -- For the RECEIVER, we still respect a truly active call (busy if a call to
  -- them is still pending/ringing/connected AFTER the stale-sweep).
  IF EXISTS (SELECT 1 FROM public.private_calls WHERE host_id = p_receiver_id AND status IN ('pending', 'ringing', 'connected'))
     OR EXISTS (SELECT 1 FROM public.private_calls WHERE caller_id = p_receiver_id AND status IN ('pending', 'ringing', 'connected')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
  END IF;

  SELECT host_level, call_rate_per_minute INTO _host_level, _host_custom_rate
    FROM public.profiles WHERE id = p_receiver_id;

  _coins_per_minute := NULLIF(_host_custom_rate, 0);

  IF (_coins_per_minute IS NULL OR _coins_per_minute <= 0) AND _level_rates IS NOT NULL AND jsonb_typeof(_level_rates) = 'array' THEN
    FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates) LOOP
      IF (_rate_entry->>'level')::integer = COALESCE(_host_level, 0) THEN
        _coins_per_minute := NULLIF((_rate_entry->>'rate')::integer, 0);
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF _coins_per_minute IS NULL OR _coins_per_minute <= 0 THEN
    _coins_per_minute := _default_rate;
  END IF;
  IF _coins_per_minute IS NULL OR _coins_per_minute <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_rate_not_configured', 'host_level', COALESCE(_host_level, 0));
  END IF;

  SELECT COALESCE(coins,0) INTO _caller_balance FROM public.profiles WHERE id = p_caller_id FOR UPDATE;
  IF _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'required', _coins_per_minute, 'balance', _caller_balance);
  END IF;

  INSERT INTO public.private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (p_caller_id, p_receiver_id, p_context_stream_id, 'ringing', now(), _coins_per_minute)
  RETURNING id INTO _call_id;

  UPDATE public.profiles
     SET is_in_call = true, current_call_id = _call_id, updated_at = now()
   WHERE id = p_caller_id;

  INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data)
  VALUES (p_caller_id, p_receiver_id, COALESCE(NULLIF(p_call_type, ''), 'video'), 'ringing', _call_id, 'call_started', jsonb_build_object('coins_per_minute', _coins_per_minute, 'timeout_seconds', _timeout_seconds));

  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute, 'timeout_seconds', _timeout_seconds);
END;
$function$;