
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
  _caller_coins       bigint;
  _caller_diamonds    bigint;
  _caller_balance     bigint;
  _remaining_minutes  integer;
BEGIN
  SELECT * INTO _call FROM public.private_calls
   WHERE id = p_call_id FOR UPDATE SKIP LOCKED;

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
    RETURN jsonb_build_object('billed', false, 'reason', 'reconnecting', 'since', _call.reconnecting_since);
  END IF;

  IF _call.viewer_rate_per_min IS NULL
     OR _call.host_rate_per_min IS NULL
     OR _call.platform_cut_percent IS NULL THEN

    SELECT setting_value INTO _settings_text
      FROM public.app_settings WHERE setting_key = 'call_rates';

    IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
      BEGIN _settings := _settings_text::jsonb; EXCEPTION WHEN OTHERS THEN _settings := '{}'::jsonb; END;
    END IF;

    BEGIN
      _commission_pct := NULLIF((_settings->>'host_commission_percent'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN _commission_pct := NULL; END;

    -- Admin Single Source of Truth: NO hardcoded fallback. Refuse to bill if missing.
    IF _commission_pct IS NULL OR _commission_pct < 0 OR _commission_pct > 100 THEN
      RETURN jsonb_build_object('billed', false, 'reason', 'billing_not_configured',
                                'detail', 'host_commission_percent missing in app_settings.call_rates');
    END IF;

    _viewer_rate  := COALESCE(_call.coins_per_minute, 0)::bigint;
    IF _viewer_rate <= 0 THEN
      RETURN jsonb_build_object('billed', false, 'reason', 'billing_not_configured',
                                'detail', 'coins_per_minute not set on call row');
    END IF;
    _platform_pct := _commission_pct;
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

  SELECT COALESCE(coins, 0)::bigint,
         COALESCE(diamonds, 0)::bigint,
         GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0))::bigint
    INTO _caller_coins, _caller_diamonds, _caller_balance
    FROM public.profiles WHERE id = _call.caller_id FOR UPDATE;

  IF COALESCE(_caller_balance, 0) < _viewer_rate THEN
    UPDATE public.private_calls
       SET status='ended', ended_at=now(), end_reason='low_balance', updated_at=now()
     WHERE id = p_call_id;
    BEGIN
      INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
      VALUES (p_call_id, 'call_ended', jsonb_build_object('end_reason', 'low_balance'), now());
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('billed', false, 'reason', 'low_balance', 'call_ended', true);
  END IF;

  UPDATE public.profiles
     SET coins = CASE
           WHEN COALESCE(coins, 0) >= COALESCE(diamonds, 0)
           THEN GREATEST(0, COALESCE(coins, 0) - _viewer_rate)
           ELSE COALESCE(coins, 0) END,
         diamonds = CASE
           WHEN COALESCE(diamonds, 0) > COALESCE(coins, 0)
           THEN GREATEST(0, COALESCE(diamonds, 0) - _viewer_rate)
           ELSE COALESCE(diamonds, 0) END,
         total_consumption = COALESCE(total_consumption, 0) + _viewer_rate,
         updated_at = now()
   WHERE id = _call.caller_id;

  IF _host_rate > 0 THEN
    UPDATE public.profiles
       SET beans            = COALESCE(beans, 0)            + _host_rate,
           weekly_earnings  = COALESCE(weekly_earnings, 0)  + _host_rate,
           total_earnings   = COALESCE(total_earnings, 0)   + _host_rate,
           pending_earnings = COALESCE(pending_earnings, 0) + _host_rate,
           updated_at       = now()
     WHERE id = _call.host_id;
  END IF;

  -- 🔴 C-1 FIX: write BOTH legacy and reconciliation columns so settle_private_call
  -- sees the tick deductions and does NOT double-charge at call end.
  UPDATE public.private_calls
     SET last_billed_minute    = _next_minute,
         last_billing_at       = now(),
         coins_charged         = COALESCE(coins_charged, 0)        + _viewer_rate,
         beans_earned          = COALESCE(beans_earned, 0)         + _host_rate,
         total_coins_deducted  = COALESCE(total_coins_deducted, 0) + _viewer_rate,
         coins_spent           = COALESCE(coins_spent, 0)          + _viewer_rate,
         host_earned           = COALESCE(host_earned, 0)          + _host_rate,
         host_earnings_amount  = COALESCE(host_earnings_amount, 0) + _host_rate,
         updated_at            = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
    VALUES (p_call_id, 'billing_tick',
      jsonb_build_object('minute', _next_minute, 'viewer_rate', _viewer_rate,
        'host_rate', _host_rate, 'caller_remaining', _caller_balance - _viewer_rate), now());
  EXCEPTION WHEN OTHERS THEN NULL; END;

  _remaining_minutes := CASE WHEN _viewer_rate <= 0 THEN NULL
    ELSE FLOOR((_caller_balance - _viewer_rate) / _viewer_rate)::integer END;

  RETURN jsonb_build_object('billed', true, 'minute', _next_minute,
    'viewer_rate', _viewer_rate, 'host_rate', _host_rate,
    'caller_remaining', _caller_balance - _viewer_rate, 'remaining_minutes', _remaining_minutes);
END;
$function$;
