-- =============================================================
-- Pillar C: dual-currency balance authority for private calls
-- =============================================================

-- 1) reserve_call_balance: gate on max(coins, diamonds)
CREATE OR REPLACE FUNCTION public.reserve_call_balance(
  p_caller_id uuid, p_host_id uuid, p_estimated_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_coins      BIGINT;
  v_caller_diamonds   BIGINT;
  v_caller_balance    BIGINT;
  v_already_reserved  BIGINT;
  v_available         BIGINT;
  v_hold_id           UUID;
BEGIN
  IF p_caller_id IS NULL OR p_host_id IS NULL OR p_estimated_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;
  IF p_caller_id = p_host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_reserve_self');
  END IF;

  SELECT COALESCE(coins, 0)::bigint,
         COALESCE(diamonds, 0)::bigint,
         GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0))::bigint
    INTO v_caller_coins, v_caller_diamonds, v_caller_balance
    FROM public.profiles
   WHERE id = p_caller_id
   FOR UPDATE;

  IF v_caller_coins IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'caller_not_found');
  END IF;

  SELECT COALESCE(SUM(reserved_coins), 0) INTO v_already_reserved
  FROM public.call_balance_reservations
  WHERE caller_id = p_caller_id AND status = 'active' AND expires_at > now();

  v_available := v_caller_balance - v_already_reserved;

  IF v_available < p_estimated_coins THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'available', v_available,
      'required', p_estimated_coins
    );
  END IF;

  INSERT INTO public.call_balance_reservations(caller_id, host_id, reserved_coins)
  VALUES (p_caller_id, p_host_id, p_estimated_coins)
  RETURNING id INTO v_hold_id;

  RETURN jsonb_build_object('success', true, 'hold_id', v_hold_id, 'reserved', p_estimated_coins);
END;
$function$;

-- 2) bill_call_minute: dual-currency debit (coins-first when larger, else diamonds)
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
  _caller_coins       bigint;
  _caller_diamonds    bigint;
  _caller_balance     bigint;
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

  -- ============================================================
  -- Pillar C dual-currency debit. Match settle_random_call:
  -- debit from the wallet with the higher balance (coins-first
  -- when tied), end the call when combined balance is insufficient.
  -- ============================================================
  SELECT COALESCE(coins, 0)::bigint,
         COALESCE(diamonds, 0)::bigint,
         GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0))::bigint
    INTO _caller_coins, _caller_diamonds, _caller_balance
    FROM public.profiles
   WHERE id = _call.caller_id
   FOR UPDATE;

  IF COALESCE(_caller_balance, 0) < _viewer_rate THEN
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

  UPDATE public.profiles
     SET coins = CASE
           WHEN COALESCE(coins, 0) >= COALESCE(diamonds, 0)
           THEN GREATEST(0, COALESCE(coins, 0) - _viewer_rate)
           ELSE COALESCE(coins, 0)
         END,
         diamonds = CASE
           WHEN COALESCE(diamonds, 0) > COALESCE(coins, 0)
           THEN GREATEST(0, COALESCE(diamonds, 0) - _viewer_rate)
           ELSE COALESCE(diamonds, 0)
         END,
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
     SET last_billed_minute = _next_minute,
         last_billing_at    = now(),
         coins_charged      = COALESCE(coins_charged, 0) + _viewer_rate,
         beans_earned       = COALESCE(beans_earned, 0)  + _host_rate,
         updated_at         = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
    VALUES (
      p_call_id,
      'billing_tick',
      jsonb_build_object(
        'minute', _next_minute,
        'viewer_rate', _viewer_rate,
        'host_rate', _host_rate,
        'caller_remaining', _caller_balance - _viewer_rate
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  _remaining_minutes := CASE
    WHEN _viewer_rate <= 0 THEN NULL
    ELSE FLOOR((_caller_balance - _viewer_rate) / _viewer_rate)::integer
  END;

  RETURN jsonb_build_object(
    'billed', true,
    'minute', _next_minute,
    'viewer_rate', _viewer_rate,
    'host_rate', _host_rate,
    'caller_remaining', _caller_balance - _viewer_rate,
    'remaining_minutes', _remaining_minutes
  );
END;
$function$;

-- 3) deduct_call_coins_per_minute: same dual-currency rule
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

  SELECT COALESCE(coins, 0)::bigint,
         COALESCE(diamonds, 0)::bigint,
         GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0))::bigint
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
     SET coins = CASE
           WHEN COALESCE(coins, 0) >= COALESCE(diamonds, 0)
           THEN GREATEST(0, COALESCE(coins, 0) - _coins_to_deduct)
           ELSE COALESCE(coins, 0)
         END,
         diamonds = CASE
           WHEN COALESCE(diamonds, 0) > COALESCE(coins, 0)
           THEN GREATEST(0, COALESCE(diamonds, 0) - _coins_to_deduct)
           ELSE COALESCE(diamonds, 0)
         END,
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