-- Pkg36: Native-only call enforcement
-- Calls (private 1-1) can ONLY be initiated from the Android native app.
-- Web/PWA browsers are blocked at both client and server level.
-- The native client sends header: x-client-platform: android-native
-- An admin override `app_settings.allow_web_calls` ('true') can re-enable web initiation if ever needed.

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
  _client_platform text;
  _allow_web text;
BEGIN
  IF p_caller_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ids');
  END IF;
  IF p_caller_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_call_self');
  END IF;

  -- 🔒 NATIVE-ONLY ENFORCEMENT (Pkg36)
  BEGIN
    _client_platform := lower(coalesce(current_setting('request.headers', true)::json->>'x-client-platform',''));
  EXCEPTION WHEN OTHERS THEN
    _client_platform := '';
  END;
  SELECT setting_value INTO _allow_web FROM public.app_settings WHERE setting_key = 'allow_web_calls' LIMIT 1;
  IF lower(coalesce(btrim(_allow_web),'false')) NOT IN ('true','1','yes','on') THEN
    IF _client_platform <> 'android-native' THEN
      RETURN jsonb_build_object('success', false, 'error', 'native_app_required',
        'message', 'Private calls are available only in the MeriLive Android app.');
    END IF;
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

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_in_call,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
  END IF;

  IF p_context_stream_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = p_context_stream_id AND ls.host_id = p_receiver_id AND ls.ended_at IS NULL AND COALESCE(ls.is_active,true) = true AND lower(COALESCE(ls.status,'active')) = 'active') THEN
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

  SELECT COALESCE(coins,0) INTO _caller_balance FROM public.profiles WHERE id = p_caller_id;
  IF _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'required', _coins_per_minute, 'balance', _caller_balance);
  END IF;

  INSERT INTO public.private_calls (caller_id, receiver_id, call_type, status, coins_per_minute, context_stream_id)
  VALUES (p_caller_id, p_receiver_id, p_call_type, 'ringing', _coins_per_minute, p_context_stream_id)
  RETURNING id INTO _call_id;

  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$function$;

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES ('allow_web_calls', 'false', 'Pkg36: When false, private calls can only be initiated from native Android app. Set to true to allow web/PWA call initiation (emergency override).')
ON CONFLICT (setting_key) DO NOTHING;