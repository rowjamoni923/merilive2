INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'private_calls_enabled', 'true', 'When false, can_initiate_private_call / start_private_call reject new calls (admin).'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings s WHERE s.setting_key = 'private_calls_enabled');

CREATE OR REPLACE FUNCTION public._resolve_private_call_coins_per_minute(p_host_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  _settings_text text;
  _settings jsonb;
  _level_rates jsonb;
  _default_rate integer := 2000;
  _host_level integer;
  _coins_per_minute integer;
  _rate_entry jsonb;
BEGIN
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
  SELECT host_level INTO _host_level FROM public.profiles WHERE id = p_host_id;
  _coins_per_minute := _default_rate;
  IF _level_rates IS NOT NULL AND _host_level IS NOT NULL THEN
    FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates) LOOP
      IF (_rate_entry->>'level')::integer = _host_level THEN
        _coins_per_minute := (_rate_entry->>'rate')::integer;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN GREATEST(1, COALESCE(_coins_per_minute, _default_rate));
END;
$$;

COMMENT ON FUNCTION public._resolve_private_call_coins_per_minute(uuid) IS
'Internal: diamonds per minute for a private call to p_host_id from app_settings.call_rates + host_level.';

CREATE OR REPLACE FUNCTION public.can_initiate_private_call(p_caller_id uuid, p_host_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enabled text;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _caller_balance integer;
  _coins_per_minute integer;
  _host_in_call boolean;
  _host_live boolean;
  _blocked_pair boolean;
BEGIN
  IF p_caller_id IS NULL OR p_host_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_ids');
  END IF;
  IF auth.uid() IS NULL OR auth.uid() <> p_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_caller_id = p_host_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_call_self');
  END IF;
  SELECT setting_value INTO _enabled FROM public.app_settings WHERE setting_key = 'private_calls_enabled' LIMIT 1;
  IF _enabled IS NOT NULL AND lower(btrim(_enabled)) NOT IN ('true', '1', 'yes', 'on') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'private_calls_disabled');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_caller_id AND is_host = true
      AND lower(COALESCE(host_status, '')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _caller_is_live_host;
  IF COALESCE(_caller_is_live_host, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hosts_cannot_initiate_user_calls');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_host_id AND is_host = true
      AND lower(COALESCE(host_status, '')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _receiver_ok;
  IF NOT COALESCE(_receiver_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receiver_not_callable_host');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked, false) = true)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_host_id AND COALESCE(is_blocked, false) = true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_blocked');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_caller_id AND blocked_id = p_host_id)
       OR (blocker_id = p_host_id AND blocked_id = p_caller_id)
  ) OR EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_caller_id AND blocked_id = p_host_id)
       OR (blocker_id = p_host_id AND blocked_id = p_caller_id)
  ) INTO _blocked_pair;
  IF COALESCE(_blocked_pair, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_blocked');
  END IF;
  SELECT COALESCE(is_in_call, false) INTO _host_in_call FROM public.profiles WHERE id = p_host_id;
  IF COALESCE(_host_in_call, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_in_call');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.host_id = p_host_id AND ls.ended_at IS NULL
      AND COALESCE(ls.is_active, true) = true
      AND lower(COALESCE(ls.status, 'active')) = 'active'
  ) INTO _host_live;
  IF COALESCE(_host_live, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_live');
  END IF;
  _coins_per_minute := public._resolve_private_call_coins_per_minute(p_host_id);
  SELECT COALESCE(coins, 0)::integer INTO _caller_balance FROM public.profiles WHERE id = p_caller_id;
  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'required', _coins_per_minute, 'current', COALESCE(_caller_balance, 0));
  END IF;
  RETURN jsonb_build_object('ok', true, 'coins_per_minute', _coins_per_minute, 'caller_balance', _caller_balance);
END;
$$;

COMMENT ON FUNCTION public.can_initiate_private_call(uuid, uuid) IS
'Preflight: same business rules as start_private_call (minus row insert) + blocks + host live/busy. Caller JWT must match p_caller_id.';

GRANT EXECUTE ON FUNCTION public.can_initiate_private_call(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_private_call(
  p_caller_id uuid,
  p_receiver_id uuid,
  p_call_type text DEFAULT 'video'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  IF p_caller_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ids');
  END IF;
  IF p_caller_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_call_self');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_caller_id AND is_host = true
      AND lower(COALESCE(host_status, '')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _caller_is_live_host;
  IF _caller_is_live_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'hosts_cannot_initiate_user_calls');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_receiver_id AND is_host = true
      AND lower(COALESCE(host_status, '')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _receiver_ok;
  IF NOT COALESCE(_receiver_ok, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'receiver_not_callable_host');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE setting_key = 'private_calls_enabled'
      AND setting_value IS NOT NULL
      AND lower(btrim(setting_value)) NOT IN ('true', '1', 'yes', 'on')
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'private_calls_disabled');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked, false) = true)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_blocked, false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_blocked');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_caller_id AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = p_caller_id)
  ) OR EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_caller_id AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = p_caller_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_blocked');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_in_call, false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.host_id = p_receiver_id AND ls.ended_at IS NULL
      AND COALESCE(ls.is_active, true) = true
      AND lower(COALESCE(ls.status, 'active')) = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_live');
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
  SELECT COALESCE(coins, 0)::integer INTO _caller_balance FROM public.profiles WHERE id = p_caller_id;
  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'required', _coins_per_minute, 'current', COALESCE(_caller_balance, 0));
  END IF;
  INSERT INTO private_calls (caller_id, host_id, call_type, status, coins_per_minute)
  VALUES (p_caller_id, p_receiver_id, p_call_type, 'ringing', _coins_per_minute)
  RETURNING id INTO _call_id;
  UPDATE public.profiles SET is_in_call = true, current_call_id = _call_id WHERE id = p_caller_id;
  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$$;