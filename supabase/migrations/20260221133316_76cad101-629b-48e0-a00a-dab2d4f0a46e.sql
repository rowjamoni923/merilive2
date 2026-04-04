
-- FIX 1: Fix deduct_call_coins_per_minute - retroactively credit host for first minute on second billing
-- FIX 2: Fix start_private_call - correct the min_level_for_custom_rate key name

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
  _settings jsonb;
  _host_commission_percent integer;
  _time_since_last_billing integer;
  _call_duration_seconds integer;
  _grace_period_seconds integer;
  _is_first_minute boolean;
  _is_second_minute boolean;
  _first_minute_host_beans integer;
BEGIN
  -- Get call record with lock
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = p_call_id
  FOR UPDATE;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;
  
  -- Calculate current call duration in seconds
  _call_duration_seconds := COALESCE(_call_record.duration_seconds, 0);
  
  -- Check if this is the first minute (0 seconds means first billing)
  _is_first_minute := _call_duration_seconds = 0;
  _is_second_minute := _call_duration_seconds = 60;
  
  -- Prevent double billing within 50 seconds
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;
  
  -- CRITICAL: Get settings from Admin Panel - NO DEFAULTS
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    RAISE WARNING 'CRITICAL: call_rates.host_commission_percent not configured in Admin Panel!';
    _host_commission_percent := 0; -- Safe fallback - company retains all
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  -- Get grace period from settings (default 21 seconds if not set)
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  -- Use the EXACT coins_per_minute stored in the call record
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- Calculate normal host commission for one minute
  _first_minute_host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  
  -- GRACE PERIOD LOGIC:
  -- First minute billing (duration=0): Host gets 0 (grace period active)
  -- Second minute billing (duration=60): Host gets commission for BOTH minutes (retroactive credit for minute 1)
  -- Subsequent billings: Normal commission per minute
  
  IF _is_first_minute THEN
    -- First minute: deduct from caller but host gets 0 (grace period)
    _host_beans := 0;
  ELSIF _is_second_minute THEN
    -- Second minute: credit host for BOTH minute 1 AND minute 2 (retroactive)
    _host_beans := _first_minute_host_beans * 2;
  ELSE
    -- Normal: one minute commission
    _host_beans := _first_minute_host_beans;
  END IF;
  
  -- Check caller balance
  SELECT coins INTO _caller_balance
  FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
    -- Before ending call for insufficient balance, credit host for first minute if it wasn't credited yet
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles 
      SET beans = COALESCE(beans, 0) + _first_minute_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans,
          updated_at = now()
      WHERE id = _call_record.host_id;
      
      UPDATE private_calls 
      SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans
      WHERE id = p_call_id;
    END IF;
    
    UPDATE private_calls 
    SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins'
    WHERE id = p_call_id;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'caller_balance', _caller_balance,
      'required', _coins_to_deduct,
      'call_ended', true
    );
  END IF;
  
  -- Deduct from caller (always happens)
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct,
      updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host (only if past grace period)
  IF _host_beans > 0 THEN
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _host_beans,
        updated_at = now()
    WHERE id = _call_record.host_id;
  END IF;
  
  -- Update call record with new duration
  UPDATE private_calls
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60,
    last_billing_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'commission_percent', _host_commission_percent,
    'caller_remaining', _caller_balance - _coins_to_deduct,
    'call_duration', _call_duration_seconds + 60,
    'is_first_minute', _is_first_minute,
    'is_second_minute', _is_second_minute,
    'grace_period_seconds', _grace_period_seconds
  );
END;
$function$;

-- FIX 2: Fix start_private_call to read correct key name
CREATE OR REPLACE FUNCTION public.start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id uuid;
  _call_id uuid;
  _host_call_rate integer;
  _host_level integer;
  _host_custom_rate integer;
  _call_settings jsonb;
  _admin_min_rate integer;
  _admin_max_rate integer;
  _min_level_for_custom integer;
  _level_rate jsonb;
  _i integer;
  _is_level_rate boolean := false;
BEGIN
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF _caller_id = _host_id THEN
    RAISE EXCEPTION 'Cannot call yourself';
  END IF;
  
  -- Check if caller is already in a call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _caller_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;
  
  -- Check if host is in another call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'Host is busy in another call';
  END IF;
  
  -- CRITICAL: Get admin settings
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  IF _call_settings IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: call_rates not configured in Admin Panel!';
  END IF;
  
  _admin_min_rate := (_call_settings->>'min_rate')::integer;
  _admin_max_rate := (_call_settings->>'max_rate')::integer;
  
  -- FIX: Check BOTH possible key names for backward compatibility
  _min_level_for_custom := COALESCE(
    (_call_settings->>'min_level_for_custom_rate')::integer,
    (_call_settings->>'min_level_for_custom')::integer,
    3
  );
  
  IF _admin_min_rate IS NULL OR _admin_max_rate IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: min_rate and max_rate must be configured!';
  END IF;
  
  -- Get host info
  SELECT user_level, call_rate_per_minute INTO _host_level, _host_custom_rate
  FROM profiles WHERE id = _host_id;
  
  _host_level := COALESCE(_host_level, 1);
  
  -- PRIORITY 1: Host custom rate (only if level >= min_level_for_custom)
  IF _host_custom_rate IS NOT NULL AND _host_custom_rate > 0 AND _host_level >= _min_level_for_custom THEN
    _host_call_rate := GREATEST(_admin_min_rate, LEAST(_host_custom_rate, _admin_max_rate));
  ELSE
    -- PRIORITY 2: Level-based rate from admin settings
    IF _call_settings->'level_rates' IS NOT NULL AND jsonb_array_length(_call_settings->'level_rates') > 0 THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates') - 1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = _host_level THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          _is_level_rate := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    IF NOT _is_level_rate OR _host_call_rate IS NULL THEN
      RAISE EXCEPTION 'No call rate configured for host level %', _host_level;
    END IF;
  END IF;
  
  IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
    RAISE EXCEPTION 'Invalid call rate';
  END IF;
  
  -- Create the call
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Mark BOTH caller and host as in_call immediately
  UPDATE profiles SET is_in_call = true, current_call_id = _call_id, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  RETURN _call_id;
END;
$function$;
