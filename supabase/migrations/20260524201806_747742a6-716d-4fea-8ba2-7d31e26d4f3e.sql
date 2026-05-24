-- Pkg320 pass-4: enforce first-minute grace before crediting host beans during live billing

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
         duration_seconds = GREATEST(COALESCE(duration_seconds, 0), _elapsed_marker),
         last_billing_at = now(),
         updated_at = now()
   WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'caller_balance', _caller_balance - _coins_to_deduct,
    'host_commission_percent', _host_commission_percent,
    'grace_seconds', _grace_seconds,
    'elapsed_marker_seconds', _elapsed_marker
  );
END;
$function$;
