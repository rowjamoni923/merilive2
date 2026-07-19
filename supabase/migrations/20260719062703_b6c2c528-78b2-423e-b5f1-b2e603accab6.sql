-- DU-2B batch 1/4: Call billing/settlement RPCs -> diamonds
-- Mechanical transform per DU-2 pack B0. Beans/gift %/call rate UNTOUCHED.
-- DU-2A soak trigger continues mirroring coins <-> diamonds.
BEGIN;

-- ---- bill_call_minute(p_call_id uuid) -- CHANGED ----
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

  SELECT COALESCE(diamonds, 0)::bigint,
         COALESCE(diamonds, 0)::bigint,
         COALESCE(diamonds, 0)::bigint
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
     SET diamonds = GREATEST(0, COALESCE(diamonds, 0) - _viewer_rate),
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


-- ---- deduct_call_coins_per_minute(p_call_id uuid) -- CHANGED ----
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _caller_coins bigint;
  _caller_diamonds bigint;
  _caller_balance bigint;
  _coins_to_deduct bigint;
  _host_beans bigint := 0;
  _settings_text text;
  _settings jsonb := '{}'::jsonb;
  _host_commission_percent numeric;
  _grace_seconds integer := 0;
  _seconds_since_last integer;
  _elapsed_marker integer;
BEGIN
  SELECT * INTO _call_record
  FROM public.private_calls
  WHERE id = p_call_id
  FOR UPDATE;

  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> _call_record.caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized_billing_caller_only');
  END IF;

  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;

  IF _call_record.last_billing_at IS NOT NULL THEN
    _seconds_since_last := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _seconds_since_last < 59 THEN
      RETURN jsonb_build_object(
        'success', true,
        'duplicate_ignored', true,
        'seconds_since_last_billing', _seconds_since_last,
        'coins_deducted', 0,
        'host_earned', 0
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _call_record.host_id
      AND is_host = true
      AND host_status = 'approved'
  ) THEN
    UPDATE public.private_calls
       SET status = 'ended', ended_at = now(), end_reason = 'host_unverified', updated_at = now()
     WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'host_unverified', 'call_ended', true);
  END IF;

  SELECT setting_value INTO _settings_text
  FROM public.app_settings
  WHERE setting_key = 'call_rates';

  IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
    BEGIN
      _settings := _settings_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      _settings := '{}'::jsonb;
    END;
  END IF;

  BEGIN
    _host_commission_percent := NULLIF((_settings->>'host_commission_percent'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    _host_commission_percent := NULL;
  END;

  BEGIN
    _grace_seconds := GREATEST(0, COALESCE(NULLIF((_settings->>'first_minute_grace_seconds'), '')::integer, 0));
  EXCEPTION WHEN OTHERS THEN
    _grace_seconds := 0;
  END;

  _coins_to_deduct := GREATEST(COALESCE(_call_record.coins_per_minute, 0), 0)::bigint;
  _elapsed_marker := GREATEST(
    1,
    EXTRACT(EPOCH FROM (now() - COALESCE(_call_record.connected_at, _call_record.started_at, now())))::integer + 1
  );

  IF _elapsed_marker >= _grace_seconds
     AND _host_commission_percent IS NOT NULL
     AND _host_commission_percent >= 0
     AND _host_commission_percent <= 100 THEN
    _host_beans := FLOOR(_coins_to_deduct::numeric * _host_commission_percent / 100.0)::bigint;
  ELSE
    _host_beans := 0;
  END IF;

  SELECT COALESCE(diamonds, 0)::bigint,
         COALESCE(diamonds, 0)::bigint,
         COALESCE(diamonds, 0)::bigint
    INTO _caller_coins, _caller_diamonds, _caller_balance
  FROM public.profiles
  WHERE id = _call_record.caller_id
  FOR UPDATE;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF COALESCE(_caller_balance, 0) < _coins_to_deduct THEN
    UPDATE public.private_calls
       SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins', updated_at = now()
     WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'call_ended', true);
  END IF;

  UPDATE public.profiles
     SET diamonds = GREATEST(0, COALESCE(diamonds, 0) - _coins_to_deduct),
         total_consumption = COALESCE(total_consumption, 0) + _coins_to_deduct,
         updated_at = now()
   WHERE id = _call_record.caller_id;

  IF _host_beans > 0 THEN
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _host_beans,
           weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
           total_earnings = COALESCE(total_earnings, 0) + _host_beans,
           pending_earnings = COALESCE(pending_earnings, 0) + _host_beans,
           updated_at = now()
     WHERE id = _call_record.host_id;
  END IF;

  UPDATE public.private_calls
     SET last_billing_at = now(),
         coins_charged = COALESCE(coins_charged, 0) + _coins_to_deduct,
         beans_earned = COALESCE(beans_earned, 0) + _host_beans,
         updated_at = now()
   WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'caller_remaining', _caller_balance - _coins_to_deduct
  );
END;
$function$;


-- ---- refund_call_on_failed_connect(p_call_id uuid) -- CHANGED ----
CREATE OR REPLACE FUNCTION public.refund_call_on_failed_connect(p_call_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _call            record;
  _ledger          record;
  _viewer_refund   bigint := 0;
  _host_reverse    bigint := 0;
  _minutes         integer := 0;
BEGIN
  SELECT * INTO _call
    FROM public.private_calls
   WHERE id = p_call_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'not_found');
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.call_events
        WHERE call_id = p_call_id AND event_type = 'call_refunded'
     ) THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  END IF;

  IF _call.connected_at IS NOT NULL
     AND COALESCE(_call.end_reason, '') NOT IN ('connect_failed','network','stuck') THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'healthy_end');
  END IF;

  FOR _ledger IN
    SELECT viewer_deducted, host_credited
      FROM public.billing_ledger
     WHERE call_id = p_call_id
     FOR UPDATE
  LOOP
    _viewer_refund := _viewer_refund + COALESCE(_ledger.viewer_deducted, 0);
    _host_reverse  := _host_reverse  + COALESCE(_ledger.host_credited,  0);
    _minutes       := _minutes + 1;
  END LOOP;

  IF _viewer_refund > 0 THEN
    UPDATE public.profiles
       SET diamonds             = COALESCE(diamonds, 0) + _viewer_refund,
           total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - _viewer_refund),
           updated_at        = now()
     WHERE id = _call.caller_id;
  END IF;

  IF _host_reverse > 0 THEN
    UPDATE public.profiles
       SET beans            = GREATEST(0, COALESCE(beans, 0)            - _host_reverse),
           total_earnings   = GREATEST(0, COALESCE(total_earnings, 0)   - _host_reverse),
           weekly_earnings  = GREATEST(0, COALESCE(weekly_earnings, 0)  - _host_reverse),
           pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - _host_reverse),
           updated_at       = now()
     WHERE id = _call.host_id;
  END IF;

  UPDATE public.private_calls
     SET total_coins_deducted = 0,
         host_earned          = 0,
         end_reason           = COALESCE(NULLIF(end_reason,''), 'connect_failed'),
         updated_at           = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
    VALUES (
      p_call_id,
      'call_refunded',
      jsonb_build_object(
        'viewer_refunded', _viewer_refund,
        'host_reversed',   _host_reverse,
        'minutes_reversed', _minutes,
        'source',          'refund_on_failed_connect'
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'refunded',         true,
    'viewer_refunded',  _viewer_refund,
    'host_reversed',    _host_reverse,
    'minutes_reversed', _minutes
  );
END;
$function$;


-- ---- settle_private_call(p_call_id uuid) -- CHANGED ----
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
    SELECT COALESCE(diamonds, 0)::bigint INTO _caller_balance
      FROM public.profiles WHERE id = _call.caller_id FOR UPDATE;
    _charged_delta := LEAST(_delta_charge, COALESCE(_caller_balance, 0));
    _final_charge := _already_charged + _charged_delta;
    IF _charged_delta > 0 THEN
      UPDATE public.profiles
        SET diamonds = COALESCE(diamonds, 0) - _charged_delta,
            total_consumption = COALESCE(total_consumption, 0) + _charged_delta,
            updated_at = now()
        WHERE id = _call.caller_id;
    END IF;
  ELSIF _delta_charge < 0 THEN
    UPDATE public.profiles
      SET diamonds = COALESCE(diamonds, 0) + ABS(_delta_charge),
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


-- ---- settle_random_call(p_session_id uuid, p_duration_seconds integer, p_ended_by text) -- CHANGED ----
CREATE OR REPLACE FUNCTION public.settle_random_call(p_session_id uuid, p_duration_seconds integer, p_ended_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_s               RECORD;
  v_settings        RECORD;
  v_window          INT;
  v_min_bill        INT;
  v_rate            INT;
  v_split           NUMERIC;
  v_status          TEXT;
  v_skip_result     JSONB := NULL;
  v_server_dur      INT;
  v_dur             INT;
  v_billable        INT;
  v_charge          BIGINT := 0;
  v_host_award      BIGINT := 0;
  v_caller_coins    BIGINT := 0;
  v_caller_diamonds BIGINT := 0;
  v_caller_balance  BIGINT := 0;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;
  IF v_s.settled THEN
    RETURN jsonb_build_object('ok', true, 'already_settled', true,
      'linked_private_call_id', v_s.linked_private_call_id);
  END IF;

  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;
  v_window   := COALESCE(v_settings.random_window_seconds, 60);
  v_min_bill := COALESCE(v_settings.min_billable_seconds, 40);
  v_rate     := COALESCE(v_settings.default_host_rate_coins_per_min, 500);
  v_split    := COALESCE(v_settings.host_split_pct, 0.50);

  v_server_dur := GREATEST(0,
    EXTRACT(EPOCH FROM (now() - COALESCE(v_s.accepted_at, v_s.started_at, now())))::INT);
  v_dur := LEAST(GREATEST(COALESCE(p_duration_seconds, 0), 0), v_server_dur);

  v_status := CASE
    WHEN p_ended_by = 'caller_skip' THEN 'skipped'
    WHEN p_ended_by = 'host'        THEN 'ended_by_host'
    WHEN p_ended_by = 'caller'      THEN 'ended_by_caller'
    WHEN p_ended_by = 'admin'       THEN 'ended_by_admin'
    ELSE 'completed'
  END;

  v_billable := LEAST(v_dur, v_window);

  IF v_billable >= v_min_bill AND p_ended_by NOT IN ('host','admin','caller_skip') THEN
    v_charge     := CEIL(v_rate::NUMERIC * v_billable::NUMERIC / 60.0)::BIGINT;
    v_host_award := CEIL(v_charge::NUMERIC * v_split)::BIGINT;

    SELECT COALESCE(diamonds,0)::BIGINT,
           COALESCE(diamonds,0)::BIGINT,
           COALESCE(diamonds, 0)::BIGINT
      INTO v_caller_coins, v_caller_diamonds, v_caller_balance
      FROM public.profiles
     WHERE id = v_s.caller_id
     FOR UPDATE;

    IF v_caller_balance < v_charge THEN
      v_charge := v_caller_balance;
      v_host_award := CEIL(v_charge::NUMERIC * v_split)::BIGINT;
    END IF;

    IF v_charge > 0 THEN
      UPDATE public.profiles
         SET diamonds = GREATEST(0, COALESCE(diamonds, 0) - v_charge),
             updated_at = now()
       WHERE id = v_s.caller_id;

      UPDATE public.profiles
         SET beans = COALESCE(beans,0) + v_host_award,
             updated_at = now()
       WHERE id = v_s.host_id;
    END IF;
  END IF;

  IF p_ended_by = 'host' AND v_dur < v_window THEN
    UPDATE public.host_match_preferences
       SET flash_disconnects_count = flash_disconnects_count + 1,
           updated_at = now(),
           flash_disconnect_cooldown_until = CASE
             WHEN flash_disconnects_count + 1 >= COALESCE(v_settings.flash_disconnect_threshold, 3)
             THEN now() + (COALESCE(v_settings.flash_disconnect_cooldown_minutes, 30) || ' minutes')::INTERVAL
             ELSE flash_disconnect_cooldown_until
           END
     WHERE host_id = v_s.host_id;
  END IF;

  IF p_ended_by = 'caller_skip'
     AND v_dur < COALESCE(v_settings.free_preview_seconds, v_window) THEN
    v_skip_result := public.register_random_skip(v_s.caller_id);
  END IF;

  UPDATE public.random_call_sessions
     SET status            = v_status,
         duration_seconds  = v_dur,
         billable_seconds  = v_billable,
         coins_charged     = v_charge,
         beans_awarded     = v_host_award,
         ended_by          = p_ended_by,
         ended_at          = COALESCE(ended_at, now()),
         settled           = true,
         updated_at        = now()
   WHERE id = p_session_id;

  UPDATE public.host_match_preferences
     SET total_calls = total_calls + 1, updated_at = now()
   WHERE host_id = v_s.host_id;

  RETURN jsonb_build_object('ok', true,
    'status', v_status,
    'duration_seconds', v_dur,
    'server_duration_seconds', v_server_dur,
    'free_window_seconds', v_window,
    'coins_charged', v_charge,
    'beans_awarded', v_host_award,
    'skip_registered', v_skip_result);
END;
$function$;


COMMIT;