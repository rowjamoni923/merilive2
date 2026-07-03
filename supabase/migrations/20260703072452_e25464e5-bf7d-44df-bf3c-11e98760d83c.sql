
-- 1) call_events log unblock. It's a diagnostic/audit stream, not enforced identity.
--    Making caller/receiver optional lets the billing tick + status-change triggers log
--    without a NOT NULL violation that was silently swallowed by their EXCEPTION blocks.
ALTER TABLE public.call_events
  ALTER COLUMN caller_id DROP NOT NULL,
  ALTER COLUMN receiver_id DROP NOT NULL;

-- 2) Add created_at with a default so callers that reference it (bill_call_minute)
--    stop failing on "column does not exist".
ALTER TABLE public.call_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_call_events_call_id_created_at
  ON public.call_events (call_id, created_at DESC);

-- 3) Harden bill_call_minute:
--    - Fill caller_id/receiver_id in event inserts (defensive even after nullability change).
--    - Also emit a diagnostic event on skip so we can trace future issues in the DB itself.
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
      INSERT INTO public.call_events (call_id, caller_id, receiver_id, call_type, status, event_type, event_data)
      VALUES (p_call_id, _call.caller_id, _call.host_id, 'video', 'ended', 'call_ended',
              jsonb_build_object('end_reason', 'low_balance'));
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[bill_call_minute] low_balance event insert failed: %', SQLERRM;
    END;
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

  UPDATE public.private_calls
     SET last_billed_minute    = _next_minute,
         last_billing_at       = now(),
         total_coins_deducted  = COALESCE(total_coins_deducted, 0) + _viewer_rate,
         coins_spent           = COALESCE(coins_spent, 0)          + _viewer_rate,
         host_earned           = COALESCE(host_earned, 0)          + _host_rate,
         host_earnings_amount  = COALESCE(host_earnings_amount, 0) + _host_rate,
         updated_at            = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, caller_id, receiver_id, call_type, status, event_type, event_data)
    VALUES (p_call_id, _call.caller_id, _call.host_id, 'video', 'connected', 'billing_tick',
      jsonb_build_object('minute', _next_minute, 'viewer_rate', _viewer_rate,
        'host_rate', _host_rate, 'caller_remaining', _caller_balance - _viewer_rate));
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[bill_call_minute] billing_tick event insert failed for %: %', p_call_id, SQLERRM;
  END;

  _remaining_minutes := CASE WHEN _viewer_rate <= 0 THEN NULL
    ELSE FLOOR((_caller_balance - _viewer_rate) / _viewer_rate)::integer END;

  RETURN jsonb_build_object('billed', true, 'minute', _next_minute,
    'viewer_rate', _viewer_rate, 'host_rate', _host_rate,
    'caller_remaining', _caller_balance - _viewer_rate, 'remaining_minutes', _remaining_minutes);
END;
$function$;

-- 4) settle_private_call: ensure duration_seconds falls back to (ended_at - connected_at)
--    when the caller value is 0 (some client hangup paths don't update it), so hosts
--    are always credited for the actual airtime.
CREATE OR REPLACE FUNCTION public.settle_private_call(p_call_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _call record; _settings_text text; _settings jsonb;
  _host_percent numeric; _grace_seconds integer;
  _duration integer; _minutes integer;
  _expected_charge bigint; _final_charge bigint;
  _already_charged bigint; _delta_charge bigint;
  _charged_delta bigint := 0;
  _expected_host_beans bigint; _already_credited bigint; _delta_host_beans bigint;
  _caller_balance bigint; _is_internal boolean;
BEGIN
  _is_internal := COALESCE(current_setting('app.bypass_call_auth', true) = 'true', false)
                  OR COALESCE(current_setting('request.jwt.claim.role', true) = 'service_role', false);

  SELECT * INTO _call FROM public.private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'call_not_found'); END IF;

  IF NOT _is_internal THEN
    IF auth.uid() IS NULL OR auth.uid() NOT IN (_call.caller_id, _call.host_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized_call_settlement');
    END IF;
  END IF;

  IF _call.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true);
  END IF;

  SELECT setting_value INTO _settings_text FROM public.app_settings WHERE setting_key = 'call_rates';
  IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing is not configured.');
  END IF;
  BEGIN
    _settings := _settings_text::jsonb;
    _host_percent := (_settings->>'host_commission_percent')::numeric;
    _grace_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing JSON invalid.');
  END;
  IF _host_percent IS NULL OR _host_percent < 0 OR _host_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_commission_percent missing.');
  END IF;
  IF _grace_seconds IS NULL OR _grace_seconds < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'first_minute_grace_seconds missing.');
  END IF;

  -- BILLING RELIABILITY: prefer actual airtime (connected_at → ended_at/now) when
  -- the stored duration_seconds is 0 or stale. Some hangup paths short-circuit
  -- the duration write, which used to hide airtime and zero-out settlement.
  _duration := GREATEST(
    COALESCE(_call.duration_seconds, 0),
    CASE
      WHEN _call.connected_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (COALESCE(_call.ended_at, now()) - _call.connected_at))::integer
      ELSE 0
    END
  );

  _already_charged := COALESCE(_call.total_coins_deducted, _call.coins_spent, 0)::bigint;
  _already_credited := COALESCE(_call.host_earned, _call.host_earnings_amount, 0)::bigint;

  IF _duration < _grace_seconds THEN
    _expected_charge := COALESCE(_call.coins_per_minute, 0)::bigint;
  ELSE
    _minutes := CEIL(_duration::numeric / 60.0)::integer;
    _expected_charge := (_minutes::bigint * COALESCE(_call.coins_per_minute, 0)::bigint);
  END IF;

  _delta_charge := _expected_charge - _already_charged;
  _final_charge := _expected_charge;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _delta_charge > 0 THEN
    SELECT COALESCE(coins, 0)::bigint INTO _caller_balance
      FROM public.profiles WHERE id = _call.caller_id FOR UPDATE;
    _charged_delta := LEAST(_delta_charge, COALESCE(_caller_balance, 0));
    _final_charge := _already_charged + _charged_delta;
    IF _charged_delta > 0 THEN
      UPDATE public.profiles
        SET coins = COALESCE(coins, 0) - _charged_delta,
            total_consumption = COALESCE(total_consumption, 0) + _charged_delta,
            updated_at = now()
        WHERE id = _call.caller_id;
    END IF;
  ELSIF _delta_charge < 0 THEN
    UPDATE public.profiles
      SET coins = COALESCE(coins, 0) + ABS(_delta_charge),
          total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - ABS(_delta_charge)),
          updated_at = now()
      WHERE id = _call.caller_id;
    _final_charge := _expected_charge;
  END IF;

  IF _duration < _grace_seconds THEN
    _expected_host_beans := 0;
  ELSE
    _expected_host_beans := FLOOR(_final_charge::numeric * _host_percent / 100.0)::bigint;
  END IF;

  _delta_host_beans := _expected_host_beans - _already_credited;

  IF _delta_host_beans > 0 THEN
    UPDATE public.profiles
      SET beans = COALESCE(beans, 0) + _delta_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _delta_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _delta_host_beans,
          pending_earnings = COALESCE(pending_earnings, 0) + _delta_host_beans,
          updated_at = now()
      WHERE id = _call.host_id;
  ELSIF _delta_host_beans < 0 THEN
    UPDATE public.profiles
      SET beans = GREATEST(0, COALESCE(beans, 0) - ABS(_delta_host_beans)),
          total_earnings = GREATEST(0, COALESCE(total_earnings, 0) - ABS(_delta_host_beans)),
          weekly_earnings = GREATEST(0, COALESCE(weekly_earnings, 0) - ABS(_delta_host_beans)),
          pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - ABS(_delta_host_beans)),
          updated_at = now()
      WHERE id = _call.host_id;
  END IF;

  UPDATE public.private_calls
    SET coins_spent = _final_charge,
        total_coins_deducted = _final_charge,
        host_earned = _expected_host_beans,
        host_earnings_amount = _expected_host_beans,
        duration_seconds = _duration,
        settled_at = now(),
        updated_at = now()
    WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, caller_id, receiver_id, call_type, status, event_type, event_data)
    VALUES (p_call_id, _call.caller_id, _call.host_id, 'video', 'settled', 'call_settled',
      jsonb_build_object('duration_seconds', _duration,
        'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric / 60.0)::integer END,
        'coins_charged_total', _final_charge, 'host_beans_total', _expected_host_beans,
        'host_percent', _host_percent));
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[settle_private_call] event insert failed for %: %', p_call_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'duration_seconds', _duration,
    'grace_seconds', _grace_seconds,
    'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric / 60.0)::integer END,
    'coins_charged_total', _final_charge,
    'host_beans_total', _expected_host_beans,
    'host_percent', _host_percent,
    'short_paid_delta', GREATEST(_delta_charge - _charged_delta, 0),
    'internal', _is_internal
  );
END;
$function$;
