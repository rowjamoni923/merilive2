CREATE OR REPLACE FUNCTION public.start_private_call(
  p_caller_id uuid,
  p_receiver_id uuid,
  p_call_type text DEFAULT 'video'::text,
  p_context_stream_id uuid DEFAULT NULL::uuid
)
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
  _default_rate integer := 2000;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _rate_entry jsonb;
  _pc_enabled text;
  _client_platform text;
  _allow_web text;
BEGIN
  IF p_caller_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ids');
  END IF;

  IF p_caller_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_call_self');
  END IF;

  BEGIN
    _client_platform := lower(coalesce(current_setting('request.headers', true)::json->>'x-client-platform',''));
  EXCEPTION WHEN OTHERS THEN
    _client_platform := '';
  END;

  SELECT setting_value INTO _allow_web FROM public.app_settings WHERE setting_key = 'allow_web_calls' LIMIT 1;
  IF lower(coalesce(btrim(_allow_web),'false')) NOT IN ('true','1','yes','on') THEN
    IF _client_platform <> 'android-native' THEN
      RETURN jsonb_build_object('success', false, 'error', 'native_app_required', 'message', 'Private calls are available only in the MeriLive Android app.');
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles p
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE p.id IN (p_caller_id, p_receiver_id)
     AND p.current_call_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.private_calls pc
        WHERE pc.id = p.current_call_id
          AND pc.status IN ('ringing', 'connected')
     );

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_caller_id
       AND is_host = true
       AND lower(COALESCE(host_status,'')) = 'approved'
       AND COALESCE(is_face_verified,false) = true
  ) INTO _caller_is_live_host;

  IF _caller_is_live_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_receiver_id
       AND is_host = true
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

  IF EXISTS (SELECT 1 FROM public.private_calls WHERE caller_id = p_caller_id AND status IN ('ringing', 'connected'))
     OR EXISTS (SELECT 1 FROM public.private_calls WHERE host_id = p_caller_id AND status IN ('ringing', 'connected')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'caller_busy_in_call');
  END IF;

  IF EXISTS (SELECT 1 FROM public.private_calls WHERE host_id = p_receiver_id AND status IN ('ringing', 'connected'))
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_in_call,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
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

  SELECT host_level, call_rate_per_minute INTO _host_level, _host_custom_rate
    FROM public.profiles
   WHERE id = p_receiver_id;

  _coins_per_minute := COALESCE(NULLIF(_host_custom_rate, 0), _default_rate);
  IF (_host_custom_rate IS NULL OR _host_custom_rate <= 0) AND _level_rates IS NOT NULL AND _host_level IS NOT NULL THEN
    FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates) LOOP
      IF (_rate_entry->>'level')::integer = _host_level THEN
        _coins_per_minute := (_rate_entry->>'rate')::integer;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  _coins_per_minute := GREATEST(1, COALESCE(_coins_per_minute, _default_rate));

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

  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
BEGIN
  SELECT * INTO _call
    FROM public.private_calls
   WHERE id = _call_id
     AND status = 'ringing'
   FOR UPDATE;

  IF _call IS NULL OR _call.host_id IS NULL OR _call.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.private_calls
     SET status = 'connected', connected_at = now(), updated_at = now()
   WHERE id = _call_id;

  UPDATE public.profiles
     SET is_in_call = true, current_call_id = _call_id, updated_at = now()
   WHERE id IN (_call.caller_id, _call.host_id);

  IF _call.stream_id IS NOT NULL THEN
    UPDATE public.live_streams
       SET is_active = false, ended_at = now(), status = 'ended'
     WHERE id = _call.stream_id;
  END IF;

  INSERT INTO public.call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_accepted', jsonb_build_object('host_id', _call.host_id))
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
BEGIN
  SELECT * INTO _call FROM public.private_calls WHERE id = _call_id AND status = 'ringing' FOR UPDATE;
  IF _call IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _call.host_id AND auth.uid() <> _call.caller_id THEN
    RAISE EXCEPTION 'Not authorized to decline this call';
  END IF;

  UPDATE public.private_calls SET status = 'declined', ended_at = now(), end_reason = 'declined', updated_at = now() WHERE id = _call_id;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET is_in_call = false, current_call_id = NULL, updated_at = now() WHERE id IN (_call.caller_id, _call.host_id);
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_private_call(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_private_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_private_call(uuid) TO authenticated;