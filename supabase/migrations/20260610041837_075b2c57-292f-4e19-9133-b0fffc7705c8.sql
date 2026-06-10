
-- Phase 2 reliability fixes
-- H-1: zombie stream window 3min → 35s (Agora benchmark: 20-30s; +5s buffer over 15s heartbeat cadence)
-- H-6: bill_call_minute returns remaining_coins / remaining_minutes (eliminate N+1 in call-billing-tick)

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer;
BEGIN
  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '35 seconds';
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);
  RETURN closed_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bill_call_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call               record;
  _next_minute        integer;
  _seconds_elapsed    integer;
  _required_seconds   integer;
  _viewer_rate        bigint;
  _host_rate          bigint;
  _platform_pct       numeric;
  _settings_text      text;
  _settings           jsonb := '{}'::jsonb;
  _commission_pct     numeric;
  _grace_seconds      integer;
  _rows               integer;
  _remaining_coins    bigint;
  _remaining_minutes  integer;
BEGIN
  SELECT *
    INTO _call
    FROM public.private_calls
   WHERE id = p_call_id
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'locked_or_not_found');
  END IF;

  IF _call.status <> 'connected' THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'not_connected', 'status', _call.status);
  END IF;

  IF _call.connected_at IS NULL THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'no_connected_at');
  END IF;

  IF COALESCE(_call.is_reconnecting, false) = true THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'reconnecting',
                              'since', _call.reconnecting_since);
  END IF;

  IF _call.viewer_rate_per_min IS NULL
     OR _call.host_rate_per_min IS NULL
     OR _call.platform_cut_percent IS NULL THEN

    SELECT setting_value INTO _settings_text
      FROM public.app_settings
     WHERE setting_key = 'call_rates';

    IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
      BEGIN _settings := _settings_text::jsonb; EXCEPTION WHEN OTHERS THEN _settings := '{}'::jsonb; END;
    END IF;

    BEGIN
      _commission_pct := NULLIF((_settings->>'host_commission_percent'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN _commission_pct := NULL; END;

    _viewer_rate  := COALESCE(_call.coins_per_minute, 0)::bigint;
    _platform_pct := COALESCE(_commission_pct, 70);
    _host_rate    := FLOOR(_viewer_rate::numeric * _platform_pct / 100.0)::bigint;

    UPDATE public.private_calls
       SET viewer_rate_per_min  = COALESCE(viewer_rate_per_min, _viewer_rate),
           host_rate_per_min    = COALESCE(host_rate_per_min,   _host_rate),
           platform_cut_percent = COALESCE(platform_cut_percent, _platform_pct),
           updated_at           = now()
     WHERE id = p_call_id;

    _call.viewer_rate_per_min  := COALESCE(_call.viewer_rate_per_min,  _viewer_rate);
    _call.host_rate_per_min    := COALESCE(_call.host_rate_per_min,    _host_rate);
    _call.platform_cut_percent := COALESCE(_call.platform_cut_percent, _platform_pct);
  END IF;

  _viewer_rate := _call.viewer_rate_per_min;
  _host_rate   := _call.host_rate_per_min;
  _grace_seconds := COALESCE(_call.connect_grace_seconds, 5);

  _seconds_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (now() - _call.connected_at))::integer - _grace_seconds);
  _next_minute := COALESCE(_call.last_billed_minute, 0) + 1;
  _required_seconds := (_next_minute - 1) * 60 + 1;

  IF _seconds_elapsed < _required_seconds THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'not_yet',
                              'seconds_elapsed', _seconds_elapsed,
                              'required_seconds', _required_seconds);
  END IF;

  UPDATE public.profiles
     SET coins             = coins - _viewer_rate,
         total_consumption = COALESCE(total_consumption, 0) + _viewer_rate,
         updated_at        = now()
   WHERE id = _call.caller_id
     AND COALESCE(coins, 0) >= _viewer_rate
   RETURNING coins INTO _remaining_coins;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows = 0 THEN
    UPDATE public.private_calls
       SET status     = 'ended',
           ended_at   = now(),
           end_reason = 'low_balance',
           updated_at = now()
     WHERE id = p_call_id;

    BEGIN
      INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
      VALUES (p_call_id, 'call_ended', jsonb_build_object('end_reason', 'low_balance'), now());
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('billed', false, 'reason', 'low_balance', 'call_ended', true);
  END IF;

  IF _host_rate > 0 THEN
    UPDATE public.profiles
       SET beans            = COALESCE(beans, 0)            + _host_rate,
           total_earnings   = COALESCE(total_earnings, 0)   + _host_rate,
           weekly_earnings  = COALESCE(weekly_earnings, 0)  + _host_rate,
           pending_earnings = COALESCE(pending_earnings, 0) + _host_rate,
           updated_at       = now()
     WHERE id = _call.host_id;
  END IF;

  INSERT INTO public.billing_ledger
    (call_id, minute_number, caller_id, host_id, viewer_deducted, host_credited, source)
  VALUES
    (p_call_id, _next_minute, _call.caller_id, _call.host_id, _viewer_rate, _host_rate, 'server_tick')
  ON CONFLICT (call_id, minute_number) DO NOTHING;

  UPDATE public.private_calls
     SET last_billed_minute    = _next_minute,
         total_minutes_billed  = COALESCE(total_minutes_billed, 0) + 1,
         total_coins_deducted  = COALESCE(total_coins_deducted, 0) + _viewer_rate,
         host_earned           = COALESCE(host_earned, 0) + _host_rate,
         last_billing_at       = now(),
         updated_at            = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
    VALUES (
      p_call_id,
      'minute_charged_server',
      jsonb_build_object(
        'minute_number',   _next_minute,
        'viewer_deducted', _viewer_rate,
        'host_credited',   _host_rate,
        'source',          'server_tick'
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  _remaining_minutes := CASE WHEN _viewer_rate > 0 THEN FLOOR(_remaining_coins::numeric / _viewer_rate)::int ELSE NULL END;

  RETURN jsonb_build_object(
    'billed',            true,
    'minute_number',     _next_minute,
    'viewer_deducted',   _viewer_rate,
    'host_credited',     _host_rate,
    'remaining_coins',   _remaining_coins,
    'remaining_minutes', _remaining_minutes,
    'source',            'server_tick'
  );
END;
$function$;
