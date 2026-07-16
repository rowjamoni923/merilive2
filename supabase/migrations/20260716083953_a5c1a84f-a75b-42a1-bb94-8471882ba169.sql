CREATE OR REPLACE FUNCTION public.can_initiate_private_call(
  p_caller_id uuid,
  p_host_id uuid,
  p_context_stream_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _enabled text;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _receiver_avail text;
  _caller_balance integer;
  _coins_per_minute integer;
  _host_in_call boolean;
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
  IF _enabled IS NOT NULL AND btrim(_enabled) <> '' AND lower(btrim(_enabled)) NOT IN ('true','1','yes','on') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'private_calls_disabled');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND is_host = true AND lower(COALESCE(host_status,'')) = 'approved' AND COALESCE(is_face_verified,false) = true) INTO _caller_is_live_host;
  IF COALESCE(_caller_is_live_host, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_host_id AND is_host = true AND lower(COALESCE(host_status,'')) = 'approved' AND COALESCE(is_face_verified,false) = true) INTO _receiver_ok;
  IF NOT COALESCE(_receiver_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receiver_not_callable_host');
  END IF;

  SELECT lower(COALESCE(host_availability, 'online')) INTO _receiver_avail
    FROM public.profiles WHERE id = p_host_id;
  IF _receiver_avail = 'offline' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_offline');
  ELSIF _receiver_avail = 'busy' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked,false) = true)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_host_id AND COALESCE(is_blocked,false) = true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_blocked');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id = p_caller_id AND blocked_id = p_host_id) OR (blocker_id = p_host_id AND blocked_id = p_caller_id))
      OR EXISTS (SELECT 1 FROM public.user_blocks WHERE (blocker_id = p_caller_id AND blocked_id = p_host_id) OR (blocker_id = p_host_id AND blocked_id = p_caller_id))
    INTO _blocked_pair;
  IF COALESCE(_blocked_pair,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_blocked');
  END IF;

  -- Only an ACTIVE private call blocks (parity with start_private_call Pkg35).
  SELECT COALESCE(is_in_call,false) INTO _host_in_call FROM public.profiles WHERE id = p_host_id;
  IF COALESCE(_host_in_call,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_in_call');
  END IF;

  -- MIG-1: `host_busy_live` + `invalid_stream_context` gates REMOVED.
  -- Live-streaming hosts CAN receive calls. p_context_stream_id is a
  -- best-effort hint only (start_private_call does not fail on stale context).

  _coins_per_minute := public._resolve_private_call_coins_per_minute(p_host_id);

  SELECT COALESCE(coins,0)::integer INTO _caller_balance FROM public.profiles WHERE id = p_caller_id;
  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'required', _coins_per_minute, 'current', COALESCE(_caller_balance,0));
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_per_minute', _coins_per_minute, 'caller_balance', _caller_balance);
END;
$function$;