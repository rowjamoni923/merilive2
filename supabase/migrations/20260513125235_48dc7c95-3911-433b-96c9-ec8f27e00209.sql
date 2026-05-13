-- Reliable private-call delivery + exact admin pricing hardening

-- 1) Allow every recovery/fallback delivery status/channel that the call delivery system writes.
ALTER TABLE public.call_delivery_log
  DROP CONSTRAINT IF EXISTS call_delivery_log_channel_check;

ALTER TABLE public.call_delivery_log
  ADD CONSTRAINT call_delivery_log_channel_check
  CHECK (channel IN ('fcm', 'realtime', 'websocket', 'sms_fallback', 'realtime_broadcast', 'native_poll', 'native_presented', 'native_action'));

ALTER TABLE public.call_delivery_log
  DROP CONSTRAINT IF EXISTS call_delivery_log_status_check;

ALTER TABLE public.call_delivery_log
  ADD CONSTRAINT call_delivery_log_status_check
  CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'expired', 'skipped_no_fcm', 'no_tokens', 'aborted_call_ended', 'presented', 'accepted', 'declined', 'timeout'));

CREATE INDEX IF NOT EXISTS idx_private_calls_host_status_created
  ON public.private_calls(host_id, status, created_at DESC)
  WHERE status IN ('pending', 'ringing');

CREATE INDEX IF NOT EXISTS idx_private_calls_caller_status_created
  ON public.private_calls(caller_id, status, created_at DESC)
  WHERE status IN ('pending', 'ringing', 'connected');

-- 2) Phone/app can confirm delivery even if the original log row was missed.
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

  IF v_channel NOT IN ('fcm', 'realtime', 'websocket', 'sms_fallback', 'realtime_broadcast', 'native_poll', 'native_presented', 'native_action') THEN
    v_channel := 'realtime';
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

-- 3) Start call: exact admin pricing, level 0 support, stale-ring cleanup, strict auth, no hidden price fallback.
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
  _default_rate integer;
  _timeout_seconds integer := 60;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _rate_entry jsonb;
  _pc_enabled text;
  _client_platform text;
  _allow_web text;
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
  EXCEPTION WHEN OTHERS THEN
    _client_platform := '';
  END;

  SELECT setting_value INTO _allow_web FROM public.app_settings WHERE setting_key = 'allow_web_calls' LIMIT 1;
  IF lower(coalesce(btrim(_allow_web),'false')) NOT IN ('true','1','yes','on') THEN
    IF _client_platform <> 'android-native' THEN
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

  IF EXISTS (SELECT 1 FROM public.private_calls WHERE caller_id = p_caller_id AND status IN ('pending', 'ringing', 'connected'))
     OR EXISTS (SELECT 1 FROM public.private_calls WHERE host_id = p_caller_id AND status IN ('pending', 'ringing', 'connected')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'caller_busy_in_call');
  END IF;

  IF EXISTS (SELECT 1 FROM public.private_calls WHERE host_id = p_receiver_id AND status IN ('pending', 'ringing', 'connected'))
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_in_call,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
  END IF;

  SELECT host_level, call_rate_per_minute INTO _host_level, _host_custom_rate
    FROM public.profiles
   WHERE id = p_receiver_id;

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

-- 4) Accept call: no missing call_events columns, no accepting expired/stale calls.
CREATE OR REPLACE FUNCTION public.accept_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
  _settings_text text;
  _settings jsonb;
  _timeout_seconds integer := 60;
BEGIN
  SELECT setting_value INTO _settings_text FROM public.app_settings WHERE setting_key = 'call_rates' LIMIT 1;
  IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
    BEGIN
      _settings := _settings_text::jsonb;
      _timeout_seconds := GREATEST(15, LEAST(120, COALESCE((_settings->>'call_timeout_seconds')::integer, 60)));
    EXCEPTION WHEN OTHERS THEN
      _timeout_seconds := 60;
    END;
  END IF;

  SELECT * INTO _call
    FROM public.private_calls
   WHERE id = _call_id
     AND status IN ('pending', 'ringing')
   FOR UPDATE;

  IF _call IS NULL OR _call.host_id IS NULL OR _call.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _call.created_at < now() - make_interval(secs => _timeout_seconds) THEN
    UPDATE public.private_calls
       SET status = 'missed', ended_at = now(), end_reason = 'timeout', updated_at = now()
     WHERE id = _call_id;

    UPDATE public.profiles
       SET is_in_call = false, current_call_id = NULL, updated_at = now()
     WHERE id IN (_call.caller_id, _call.host_id);

    INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data, ended_at)
    VALUES (_call.caller_id, _call.host_id, 'video', 'missed', _call_id, 'call_missed', jsonb_build_object('reason', 'accept_after_timeout'), now());

    RETURN false;
  END IF;

  UPDATE public.private_calls
     SET status = 'connected', connected_at = now(), updated_at = now()
   WHERE id = _call_id;

  UPDATE public.profiles
     SET is_in_call = true, current_call_id = _call_id, updated_at = now()
   WHERE id IN (_call.caller_id, _call.host_id);

  UPDATE public.live_streams
     SET is_active = false, ended_at = now(), status = 'ended'
   WHERE host_id = _call.host_id
     AND ended_at IS NULL
     AND is_active = true;

  INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data)
  VALUES (_call.caller_id, _call.host_id, 'video', 'connected', _call_id, 'call_accepted', jsonb_build_object('host_id', _call.host_id, 'accepted_at', now()));

  RETURN true;
END;
$function$;

-- 5) Decline only live ringing/pending calls and log complete event rows.
CREATE OR REPLACE FUNCTION public.decline_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
BEGIN
  SELECT * INTO _call FROM public.private_calls WHERE id = _call_id AND status IN ('pending', 'ringing') FOR UPDATE;
  IF _call IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _call.host_id AND auth.uid() <> _call.caller_id THEN
    RAISE EXCEPTION 'Not authorized to decline this call';
  END IF;

  UPDATE public.private_calls SET status = 'declined', ended_at = now(), end_reason = 'declined', updated_at = now() WHERE id = _call_id;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET is_in_call = false, current_call_id = NULL, updated_at = now() WHERE id IN (_call.caller_id, _call.host_id);

  INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data, ended_at)
  VALUES (_call.caller_id, _call.host_id, 'video', 'declined', _call_id, 'call_declined', jsonb_build_object('declined_by', auth.uid()), now());

  RETURN true;
END;
$function$;

-- 6) Timeout must NEVER turn a connected call into missed.
CREATE OR REPLACE FUNCTION public.timeout_private_call(_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  call_rec RECORD;
BEGIN
  SELECT * INTO call_rec FROM public.private_calls WHERE id = _call_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF call_rec.status = 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_already_connected');
  END IF;

  IF call_rec.status IN ('ended', 'declined', 'missed') THEN
    RETURN jsonb_build_object('success', true, 'already_ended', true, 'status', call_rec.status);
  END IF;

  IF call_rec.status NOT IN ('pending', 'ringing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_timeoutable', 'status', call_rec.status);
  END IF;

  UPDATE public.private_calls
     SET status = 'missed', ended_at = now(), end_reason = 'timeout', updated_at = now()
   WHERE id = _call_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (call_rec.caller_id, call_rec.host_id);

  INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data, ended_at)
  VALUES (call_rec.caller_id, call_rec.host_id, 'video', 'missed', _call_id, 'call_missed', jsonb_build_object('reason', 'timeout'), now());

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_private_call(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_private_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_private_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timeout_private_call(uuid) TO authenticated;