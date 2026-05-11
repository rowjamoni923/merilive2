-- Fix private-call migration:
-- 1. Drop legacy 2-arg start_private_call overload (no longer called; causes confusion)
-- 2. Remove hardcoded 2000 default_rate fallback (Pkg28: no hardcoded financial defaults)
-- 3. New start_private_call: add stale-call cleanup, started_at, min/max clamp parity
-- 4. _resolve_private_call_coins_per_minute returns NULL when admin not configured

DROP FUNCTION IF EXISTS public.start_private_call(uuid, uuid);

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
  _default_rate integer;
  _min_rate integer;
  _max_rate integer;
  _min_level_for_custom integer;
  _host_level integer;
  _host_custom_rate integer;
  _coins_per_minute integer;
  _rate_entry jsonb;
BEGIN
  SELECT setting_value INTO _settings_text
  FROM public.app_settings WHERE setting_key = 'call_rates' LIMIT 1;

  IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    _settings := _settings_text::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  _default_rate := NULLIF(_settings->>'default_rate','')::integer;
  _min_rate     := NULLIF(_settings->>'min_rate','')::integer;
  _max_rate     := NULLIF(_settings->>'max_rate','')::integer;
  _min_level_for_custom := COALESCE(NULLIF(_settings->>'min_level_for_custom_rate','')::integer, 6);
  _level_rates  := _settings->'level_rates';

  SELECT host_level, call_rate_per_minute
    INTO _host_level, _host_custom_rate
  FROM public.profiles WHERE id = p_host_id;

  -- Custom rate path (host has admin-eligible custom rate)
  IF _host_custom_rate IS NOT NULL AND _host_custom_rate > 0
     AND COALESCE(_host_level,0) >= _min_level_for_custom THEN
    _coins_per_minute := _host_custom_rate;
    IF _min_rate IS NOT NULL THEN _coins_per_minute := GREATEST(_coins_per_minute, _min_rate); END IF;
    IF _max_rate IS NOT NULL THEN _coins_per_minute := LEAST(_coins_per_minute, _max_rate); END IF;
    RETURN GREATEST(1, _coins_per_minute);
  END IF;

  -- Level-based rate
  IF _level_rates IS NOT NULL AND _host_level IS NOT NULL THEN
    FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates) LOOP
      IF (_rate_entry->>'level')::integer = _host_level THEN
        _coins_per_minute := (_rate_entry->>'rate')::integer;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF _coins_per_minute IS NULL THEN
    _coins_per_minute := _default_rate;
  END IF;

  IF _coins_per_minute IS NULL OR _coins_per_minute <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN GREATEST(1, _coins_per_minute);
END;
$$;

COMMENT ON FUNCTION public._resolve_private_call_coins_per_minute(uuid) IS
'Resolves diamonds/min for a private call to host. Returns NULL when admin call_rates not configured (Pkg28: no hardcoded defaults).';

-- can_initiate_private_call: handle NULL rate
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

  SELECT setting_value INTO _enabled
  FROM public.app_settings WHERE setting_key = 'private_calls_enabled' LIMIT 1;

  IF _enabled IS NOT NULL AND btrim(_enabled) <> ''
     AND lower(btrim(_enabled)) NOT IN ('true','1','yes','on') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'private_calls_disabled');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_caller_id AND is_host = true
      AND lower(COALESCE(host_status,'')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _caller_is_live_host;

  IF COALESCE(_caller_is_live_host, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_host_id AND is_host = true
      AND lower(COALESCE(host_status,'')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _receiver_ok;

  IF NOT COALESCE(_receiver_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receiver_not_callable_host');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked,false) = true)
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_host_id  AND COALESCE(is_blocked,false) = true) THEN
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

  IF COALESCE(_blocked_pair,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_blocked');
  END IF;

  SELECT COALESCE(is_in_call,false) INTO _host_in_call FROM public.profiles WHERE id = p_host_id;
  IF COALESCE(_host_in_call,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_in_call');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.host_id = p_host_id AND ls.ended_at IS NULL
      AND COALESCE(ls.is_active,true) = true
      AND lower(COALESCE(ls.status,'active')) = 'active'
  ) INTO _host_live;

  IF COALESCE(_host_live,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_live');
  END IF;

  _coins_per_minute := public._resolve_private_call_coins_per_minute(p_host_id);
  IF _coins_per_minute IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'call_rate_not_configured');
  END IF;

  SELECT COALESCE(coins,0)::integer INTO _caller_balance
  FROM public.profiles WHERE id = p_caller_id;

  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance',
      'required', _coins_per_minute, 'current', COALESCE(_caller_balance,0));
  END IF;

  RETURN jsonb_build_object('ok', true,
    'coins_per_minute', _coins_per_minute,
    'caller_balance', _caller_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_initiate_private_call(uuid, uuid) TO authenticated;

-- Updated start_private_call: stale-call cleanup, started_at, no hardcoded default, NULL rate guard
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
  _call_id uuid;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _pc_enabled text;
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

  SELECT setting_value INTO _pc_enabled
  FROM public.app_settings WHERE setting_key = 'private_calls_enabled' LIMIT 1;
  IF _pc_enabled IS NOT NULL AND btrim(_pc_enabled) <> ''
     AND lower(btrim(_pc_enabled)) NOT IN ('true','1','yes','on') THEN
    RETURN jsonb_build_object('success', false, 'error', 'private_calls_disabled');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked,false) = true)
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_blocked,false) = true) THEN
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

  -- Stale-call cleanup (parity with legacy implementation)
  UPDATE public.private_calls
     SET status = 'ended', ended_at = now(),
         end_reason = 'cancelled_by_new_call', updated_at = now()
   WHERE caller_id = p_caller_id AND host_id = p_receiver_id
     AND status IN ('pending','ringing');

  UPDATE public.private_calls
     SET status = 'ended', ended_at = now(),
         end_reason = 'cancelled_stale', updated_at = now()
   WHERE (caller_id = p_caller_id OR host_id = p_receiver_id)
     AND status IN ('pending','ringing')
     AND created_at < now() - interval '60 seconds';

  -- Clear stale is_in_call flags (no active call referenced)
  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (p_caller_id, p_receiver_id)
     AND is_in_call = true
     AND (current_call_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.private_calls
        WHERE id = current_call_id AND status IN ('connected','ringing')
     ));

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_in_call,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'caller_already_in_call');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id AND COALESCE(is_in_call,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_in_call');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.host_id = p_receiver_id AND ls.ended_at IS NULL
      AND COALESCE(ls.is_active,true) = true
      AND lower(COALESCE(ls.status,'active')) = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_busy_live');
  END IF;

  _coins_per_minute := public._resolve_private_call_coins_per_minute(p_receiver_id);
  IF _coins_per_minute IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_rate_not_configured');
  END IF;

  SELECT COALESCE(coins,0)::integer INTO _caller_balance
  FROM public.profiles WHERE id = p_caller_id;

  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance',
      'required', _coins_per_minute, 'current', COALESCE(_caller_balance,0));
  END IF;

  INSERT INTO public.private_calls (caller_id, host_id, call_type, status, started_at, coins_per_minute)
  VALUES (p_caller_id, p_receiver_id, p_call_type, 'ringing', now(), _coins_per_minute)
  RETURNING id INTO _call_id;

  UPDATE public.profiles
     SET is_in_call = true, current_call_id = _call_id, updated_at = now()
   WHERE id = p_caller_id;

  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_private_call_coins_per_minute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_private_call(uuid, uuid, text) TO authenticated;