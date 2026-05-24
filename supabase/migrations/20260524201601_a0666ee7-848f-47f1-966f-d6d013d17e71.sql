-- Pkg320 pass-3: private-call billing duration + duplicate notification + cleanup hardening

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

  -- HARD ANTI-DOUBLE-CHARGE LOCK:
  -- SELECT ... FOR UPDATE serializes concurrent RPC calls. The first request updates
  -- last_billing_at; any duplicate request in the same minute sees it and returns
  -- without touching caller diamonds or host beans.
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

  -- Store the real elapsed marker at this billing tick, not +60 seconds.
  -- The old +60 inflated a 1-20s call to 60s, bypassing first_minute_grace_seconds
  -- and incorrectly crediting host beans on short calls.
  _elapsed_marker := GREATEST(
    1,
    EXTRACT(EPOCH FROM (now() - COALESCE(_call_record.connected_at, _call_record.started_at, now())))::integer + 1
  );

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
    'elapsed_marker_seconds', _elapsed_marker
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_private_call_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_name text;
  v_call_type text;
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Caller')
  INTO v_caller_name
  FROM public.profiles
  WHERE id = NEW.caller_id;

  v_call_type := COALESCE(NEW.call_type, 'video');

  -- Incoming-call delivery is handled by call-deliver (dedicated FCM data payload)
  -- plus the scoped private_calls realtime listener. Do not insert a generic
  -- call_received notification here; it creates duplicate/incorrect call pushes.

  IF TG_OP = 'UPDATE'
     AND lower(COALESCE(OLD.status, '')) IS DISTINCT FROM lower(COALESCE(NEW.status, ''))
     AND lower(COALESCE(NEW.status, '')) = 'missed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (
      NEW.host_id,
      'call_missed',
      'Missed Call',
      'You missed a ' || v_call_type || ' call from ' || COALESCE(v_caller_name, 'Caller'),
      jsonb_build_object(
        'call_id', NEW.id,
        'caller_id', NEW.caller_id,
        'caller_name', COALESCE(v_caller_name, 'Caller'),
        'call_type', v_call_type,
        'action_url', '/call-history'
      ),
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_stale_in_call_flags() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_in_call_flags() TO service_role, postgres;
