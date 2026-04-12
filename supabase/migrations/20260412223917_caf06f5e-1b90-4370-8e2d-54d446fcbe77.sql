
-- FIX 1: get_effective_host_percent() must read from 'gift_commission' key
CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _percent numeric;
  _setting_value jsonb;
BEGIN
  -- Read from gift_commission (where admin panel saves it)
  SELECT (setting_value)::jsonb INTO _setting_value
  FROM app_settings
  WHERE setting_key = 'gift_commission';

  IF _setting_value IS NOT NULL AND (_setting_value->>'host_percent') IS NOT NULL THEN
    _percent := (_setting_value->>'host_percent')::numeric;
    IF _percent > 0 THEN
      RETURN _percent;
    END IF;
  END IF;

  -- Fallback: try legacy key
  BEGIN
    SELECT (setting_value)::numeric INTO _percent
    FROM app_settings
    WHERE setting_key = 'host_earning_percent';
    IF _percent IS NOT NULL AND _percent > 0 THEN
      RETURN _percent;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- ignore parse errors
  END;

  -- Default 0 if nothing configured
  RETURN 0;
END;
$$;

-- FIX 2: deduct_call_coins_per_minute needs bypass_profile_protection
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _call_record record;
  _caller_balance integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _settings jsonb;
  _host_commission_percent integer;
  _time_since_last_billing integer;
  _call_duration_seconds integer;
  _grace_period_seconds integer;
  _is_first_minute boolean;
  _is_second_minute boolean;
  _first_minute_host_beans integer;
BEGIN
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;

  _call_duration_seconds := COALESCE(_call_record.duration_seconds, 0);
  _is_first_minute := _call_duration_seconds = 0;
  _is_second_minute := _call_duration_seconds = 60;

  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;

  SELECT (setting_value)::jsonb INTO _settings FROM app_settings WHERE setting_key = 'call_rates';
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    _host_commission_percent := 0;
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;

  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;

  _coins_to_deduct := _call_record.coins_per_minute;
  _first_minute_host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);

  IF _is_first_minute THEN
    _host_beans := 0;
  ELSIF _is_second_minute THEN
    _host_beans := _first_minute_host_beans * 2;
  ELSE
    _host_beans := _first_minute_host_beans;
  END IF;

  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;

  -- CRITICAL: Bypass profile protection trigger for financial operations
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _caller_balance < _coins_to_deduct THEN
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles
      SET beans = COALESCE(beans, 0) + _first_minute_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans,
          updated_at = now()
      WHERE id = _call_record.host_id;

      UPDATE private_calls
      SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans,
          host_earnings_amount = COALESCE(host_earnings_amount, 0) + _first_minute_host_beans
      WHERE id = p_call_id;
    END IF;

    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins' WHERE id = p_call_id;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'caller_balance', _caller_balance, 'required', _coins_to_deduct, 'call_ended', true);
  END IF;

  -- Deduct diamonds from caller
  UPDATE profiles SET coins = coins - _coins_to_deduct, updated_at = now() WHERE id = _call_record.caller_id;

  -- Credit beans to host
  IF _host_beans > 0 THEN
    UPDATE profiles
    SET beans = COALESCE(beans, 0) + _host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _host_beans,
        updated_at = now()
    WHERE id = _call_record.host_id;
  END IF;

  -- Update call record
  UPDATE private_calls
  SET coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
      total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
      host_earned = COALESCE(host_earned, 0) + _host_beans,
      host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
      duration_seconds = COALESCE(duration_seconds, 0) + 60,
      last_billing_at = now()
  WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'caller_remaining', _caller_balance - _coins_to_deduct,
    'caller_balance', _caller_balance - _coins_to_deduct,
    'duration_seconds', COALESCE(_call_record.duration_seconds, 0) + 60
  );
END;
$$;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.get_effective_host_percent() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.deduct_call_coins_per_minute(uuid) TO authenticated, service_role, anon;
