CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _caller_balance integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _settings_text text;
  _settings jsonb;
  _host_commission_percent numeric;
BEGIN
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = _call_record.host_id AND is_host = true AND host_status = 'approved'
  ) THEN
    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'host_unverified' WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'host_unverified', 'call_ended', true);
  END IF;

  SELECT setting_value INTO _settings_text FROM app_settings WHERE setting_key = 'call_rates';
  BEGIN _settings := _settings_text::jsonb; EXCEPTION WHEN OTHERS THEN _settings := '{}'::jsonb; END;

  -- Pkg parity with settle_private_call: validate host_commission_percent strictly.
  -- If admin misconfig (missing/invalid/out-of-range) → skip host credit this tick
  -- (still charge caller so call doesn't break). End-of-call settle will reconcile
  -- once admin fixes settings, OR will (correctly) credit 0 if still missing.
  _host_commission_percent := NULLIF((_settings->>'host_commission_percent'), '')::numeric;

  _coins_to_deduct := COALESCE(_call_record.coins_per_minute, 0);

  IF _host_commission_percent IS NULL
     OR _host_commission_percent < 0
     OR _host_commission_percent > 100 THEN
    _host_beans := 0;  -- loud-on-settle: settle will error if still misconfigured at end
  ELSE
    _host_beans := FLOOR(_coins_to_deduct::numeric * _host_commission_percent / 100.0)::integer;
  END IF;

  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _caller_balance < _coins_to_deduct THEN
    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins' WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'call_ended', true);
  END IF;

  UPDATE profiles
     SET coins = coins - _coins_to_deduct,
         total_consumption = COALESCE(total_consumption, 0) + _coins_to_deduct,
         updated_at = now()
   WHERE id = _call_record.caller_id;

  IF _host_beans > 0 THEN
    UPDATE profiles
       SET beans = COALESCE(beans, 0) + _host_beans,
           weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
           total_earnings = COALESCE(total_earnings, 0) + _host_beans,
           pending_earnings = COALESCE(pending_earnings, 0) + _host_beans,
           updated_at = now()
     WHERE id = _call_record.host_id;
  END IF;

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
    'caller_balance', _caller_balance - _coins_to_deduct,
    'host_commission_percent', _host_commission_percent
  );
END;
$function$;