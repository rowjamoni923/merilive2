CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _caller_balance bigint;
  _coins_to_deduct bigint;
  _host_beans bigint;
  _settings_text text;
  _settings jsonb := '{}'::jsonb;
  _host_commission_percent numeric;
BEGIN
  SELECT * INTO _call_record FROM public.private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _call_record.host_id AND is_host = true AND host_status = 'approved'
  ) THEN
    UPDATE public.private_calls
       SET status = 'ended', ended_at = now(), end_reason = 'host_unverified', updated_at = now()
     WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'host_unverified', 'call_ended', true);
  END IF;

  SELECT setting_value INTO _settings_text FROM public.app_settings WHERE setting_key = 'call_rates';
  IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
    BEGIN
      _settings := _settings_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      _settings := '{}'::jsonb;
    END;
  END IF;

  -- Strict zero-default policy: bad/missing host commission never uses a hidden fallback.
  -- Also never let a bad admin value crash the active billing tick.
  BEGIN
    _host_commission_percent := NULLIF((_settings->>'host_commission_percent'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    _host_commission_percent := NULL;
  END;

  _coins_to_deduct := GREATEST(COALESCE(_call_record.coins_per_minute, 0), 0)::bigint;

  IF _host_commission_percent IS NULL
     OR _host_commission_percent < 0
     OR _host_commission_percent > 100 THEN
    _host_beans := 0;
  ELSE
    _host_beans := FLOOR(_coins_to_deduct::numeric * _host_commission_percent / 100.0)::bigint;
  END IF;

  SELECT COALESCE(coins, 0)::bigint INTO _caller_balance
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
     SET coins = COALESCE(coins, 0) - _coins_to_deduct,
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
     SET coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
         total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
         host_earned = COALESCE(host_earned, 0) + _host_beans,
         host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
         duration_seconds = COALESCE(duration_seconds, 0) + 60,
         last_billing_at = now(),
         updated_at = now()
   WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'caller_balance', _caller_balance - _coins_to_deduct,
    'host_commission_percent', _host_commission_percent
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_private_call(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
  _settings_text text;
  _settings jsonb;
  _host_percent numeric;
  _grace_seconds integer;
  _duration integer;
  _minutes integer;
  _expected_charge bigint;
  _final_charge bigint;
  _already_charged bigint;
  _delta_charge bigint;
  _charged_delta bigint := 0;
  _expected_host_beans bigint;
  _already_credited bigint;
  _delta_host_beans bigint;
  _caller_balance bigint;
BEGIN
  SELECT * INTO _call FROM public.private_calls WHERE id = p_call_id FOR UPDATE;

  IF _call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF _call.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true);
  END IF;

  SELECT setting_value INTO _settings_text
  FROM public.app_settings
  WHERE setting_key = 'call_rates';

  IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing is not configured. Admin must set app_settings.call_rates.');
  END IF;

  BEGIN
    _settings := _settings_text::jsonb;
    _host_percent := (_settings->>'host_commission_percent')::numeric;
    _grace_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing JSON is invalid. Admin must fix app_settings.call_rates.');
  END;

  IF _host_percent IS NULL OR _host_percent < 0 OR _host_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call host commission percent is not configured.');
  END IF;

  IF _grace_seconds IS NULL OR _grace_seconds < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call grace seconds is not configured. Admin must set call_rates.first_minute_grace_seconds.');
  END IF;

  _duration := GREATEST(0, COALESCE(_call.duration_seconds, 0));
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
    FROM public.profiles
    WHERE id = _call.caller_id
    FOR UPDATE;

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
      settled_at = now(),
      updated_at = now()
  WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'duration_seconds', _duration,
    'grace_seconds', _grace_seconds,
    'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric / 60.0)::integer END,
    'coins_charged_total', _final_charge,
    'host_beans_total', _expected_host_beans,
    'host_percent', _host_percent,
    'short_paid_delta', GREATEST(_delta_charge - _charged_delta, 0)
  );
END;
$function$;