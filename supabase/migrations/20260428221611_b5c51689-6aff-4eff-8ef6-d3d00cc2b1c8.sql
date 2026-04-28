CREATE OR REPLACE FUNCTION public.settle_private_call(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _call RECORD;
  _settings_text text;
  _settings jsonb;
  _host_percent numeric;
  _grace_seconds integer;
  _duration integer;
  _minutes integer;
  _expected_charge integer;
  _already_charged integer;
  _delta_charge integer;
  _expected_host_beans integer;
  _already_credited integer;
  _delta_host_beans integer;
  _caller_balance integer;
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

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _duration < _grace_seconds THEN
    _expected_charge := COALESCE(_call.coins_per_minute, 0);
    _expected_host_beans := 0;
  ELSE
    _minutes := CEIL(_duration::numeric / 60.0)::integer;
    _expected_charge := _minutes * COALESCE(_call.coins_per_minute, 0);
    _expected_host_beans := FLOOR(_expected_charge::numeric * _host_percent / 100.0)::integer;
  END IF;

  _already_charged := COALESCE(_call.total_coins_deducted, _call.coins_spent, 0);
  _already_credited := COALESCE(_call.host_earned, _call.host_earnings_amount, 0);

  _delta_charge := _expected_charge - _already_charged;
  _delta_host_beans := _expected_host_beans - _already_credited;

  IF _delta_charge > 0 THEN
    SELECT coins INTO _caller_balance FROM public.profiles WHERE id = _call.caller_id FOR UPDATE;
    _delta_charge := LEAST(_delta_charge, COALESCE(_caller_balance, 0));
    IF _delta_charge > 0 THEN
      UPDATE public.profiles
      SET coins = coins - _delta_charge,
          total_consumption = COALESCE(total_consumption, 0) + _delta_charge,
          updated_at = now()
      WHERE id = _call.caller_id;
    END IF;
  ELSIF _delta_charge < 0 THEN
    UPDATE public.profiles
    SET coins = coins + ABS(_delta_charge),
        total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - ABS(_delta_charge)),
        updated_at = now()
    WHERE id = _call.caller_id;
  END IF;

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
  SET coins_spent = _expected_charge,
      total_coins_deducted = _expected_charge,
      host_earned = _expected_host_beans,
      host_earnings_amount = _expected_host_beans,
      settled_at = now()
  WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'duration_seconds', _duration,
    'grace_seconds', _grace_seconds,
    'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric / 60.0)::integer END,
    'coins_charged_total', _expected_charge,
    'host_beans_total', _expected_host_beans,
    'host_percent', _host_percent
  );
END;
$$;