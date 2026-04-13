
-- ============================================================
-- FIX #1: Call Agency Commission - Column Mismatch (CRITICAL)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission_from_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_agency_id UUID;
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
BEGIN
  -- Only fire when call transitions TO ended/completed
  IF NEW.status NOT IN ('ended', 'completed') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Find host's active agency
  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.host_id AND ah.status = 'active'
  LIMIT 1;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ✅ FIX: Use CORRECT column names: host_earned, host_earnings_amount, total_coins_deducted
  _host_earnings := COALESCE(
    NULLIF(NEW.host_earned, 0),
    NULLIF(NEW.host_earnings_amount, 0),
    FLOOR(COALESCE(NEW.total_coins_deducted, NEW.coins_spent, 0) * public.get_effective_host_percent() / 100)
  );

  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN
    RETURN NEW;
  END IF;

  -- Get agency level and commission rate
  SELECT a.level INTO _agency_level FROM agencies a WHERE a.id = _host_agency_id;
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate
  FROM agency_level_tiers alt
  WHERE alt.level_code = COALESCE(_agency_level, 'A1') AND alt.is_active = true;

  IF _agency_commission_rate IS NULL THEN
    _agency_commission_rate := 3;
  END IF;

  _commission_amount := FLOOR(_host_earnings * _agency_commission_rate / 100);

  IF _commission_amount > 0 THEN
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;

    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.host_id, 'call', _host_earnings,
      _agency_commission_rate, _commission_amount, NEW.id,
      'Call commission (duration: ' || COALESCE(NEW.duration_seconds, 0) || 's)'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- FIX #2: deduct_call_coins_per_minute - Add pending_earnings
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Anti-duplicate billing check
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;

  -- Get call settings
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

  -- Grace period: 1st minute = 0 beans, 2nd minute = 2x beans (1st+2nd)
  IF _is_first_minute THEN
    _host_beans := 0;
  ELSIF _is_second_minute THEN
    _host_beans := _first_minute_host_beans * 2;
  ELSE
    _host_beans := _first_minute_host_beans;
  END IF;

  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;

  -- Bypass profile protection
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Insufficient balance handling
  IF _caller_balance < _coins_to_deduct THEN
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles
      SET beans = COALESCE(beans, 0) + _first_minute_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans,
          pending_earnings = COALESCE(pending_earnings, 0) + _first_minute_host_beans,
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

  -- ✅ FIX: Credit beans to host WITH pending_earnings (consistent with gift flow)
  IF _host_beans > 0 THEN
    UPDATE profiles
    SET beans = COALESCE(beans, 0) + _host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _host_beans,
        pending_earnings = COALESCE(pending_earnings, 0) + _host_beans,
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.auto_credit_agency_commission_from_call() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_call_coins_per_minute(uuid) TO authenticated, service_role;
