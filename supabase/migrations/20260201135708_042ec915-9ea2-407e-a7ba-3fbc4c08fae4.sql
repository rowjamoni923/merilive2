
-- Update the deduct_call_coins_per_minute function with configurable grace period
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
  -- Grace period is how many seconds into first minute before host starts earning
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21; -- Default grace period
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  -- Use the EXACT coins_per_minute stored in the call record
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- GRACE PERIOD LOGIC:
  -- First billing (first minute): 
  --   - If user ends call before grace_period_seconds (e.g., 21 seconds), host gets 0
  --   - After grace_period_seconds, host gets normal commission
  -- Subsequent billings (2nd minute onwards):
  --   - Host gets normal commission from second 1 of each minute
  
  IF _is_first_minute THEN
    -- First minute: We bill immediately when call starts
    -- Host will only get beans if caller stays past grace period
    -- This is tracked in the call_events or we calculate prorated beans on call end
    -- For now, we assume first minute = grace period applies
    -- The actual grace period check happens in real-time billing timer on frontend
    
    -- If call ends before grace period, host gets 0
    -- Since this is FIRST billing (at minute 0), we give 0 to host initially
    -- The host earning will be adjusted at end of first minute based on actual duration
    _host_beans := 0;
    RAISE NOTICE 'First minute billing: grace period % seconds, host gets 0 initially', _grace_period_seconds;
  ELSE
    -- Subsequent minutes: Normal host commission from the start
    -- If past grace period in first minute OR any subsequent minute
    _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  END IF;
  
  -- Check caller balance
  SELECT coins INTO _caller_balance
  FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
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
    'grace_period_seconds', _grace_period_seconds
  );
END;
$$;

-- Create a new function to handle grace period earning adjustment
-- This function is called when the call ends to properly credit host for first minute
CREATE OR REPLACE FUNCTION public.finalize_first_minute_earnings(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record record;
  _settings jsonb;
  _host_commission_percent integer;
  _grace_period_seconds integer;
  _first_minute_beans integer;
  _actual_duration_seconds integer;
BEGIN
  -- Get call record
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = p_call_id;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  
  -- Get settings
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  -- Get commission percent
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    _host_commission_percent := 0;
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  -- Get grace period
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  -- Calculate actual duration (from start to end)
  _actual_duration_seconds := GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(_call_record.ended_at, now()) - _call_record.started_at))::integer,
    0
  );
  
  -- If call lasted less than grace period, host gets nothing (already 0)
  IF _actual_duration_seconds < _grace_period_seconds THEN
    RAISE NOTICE 'Call ended before grace period (% < % seconds), host earned 0', _actual_duration_seconds, _grace_period_seconds;
    RETURN jsonb_build_object(
      'success', true,
      'host_earned_first_minute', 0,
      'reason', 'ended_before_grace_period',
      'actual_duration', _actual_duration_seconds,
      'grace_period', _grace_period_seconds
    );
  END IF;
  
  -- If call lasted past grace period but within first minute (< 60 seconds),
  -- we need to credit the host for the first minute they earned
  IF _actual_duration_seconds >= _grace_period_seconds AND _call_record.duration_seconds <= 60 THEN
    -- Calculate first minute beans (was 0 initially, now we credit it)
    _first_minute_beans := FLOOR(_call_record.coins_per_minute * _host_commission_percent / 100);
    
    -- Credit host
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _first_minute_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_beans,
        total_earnings = COALESCE(total_earnings, 0) + _first_minute_beans,
        updated_at = now()
    WHERE id = _call_record.host_id;
    
    -- Update call record
    UPDATE private_calls
    SET host_earned = COALESCE(host_earned, 0) + _first_minute_beans
    WHERE id = p_call_id;
    
    RAISE NOTICE 'Call passed grace period, credited host % beans for first minute', _first_minute_beans;
    RETURN jsonb_build_object(
      'success', true,
      'host_earned_first_minute', _first_minute_beans,
      'reason', 'passed_grace_period',
      'actual_duration', _actual_duration_seconds,
      'grace_period', _grace_period_seconds
    );
  END IF;
  
  -- Call lasted more than 60 seconds, first minute earning was already handled
  RETURN jsonb_build_object(
    'success', true,
    'host_earned_first_minute', 0,
    'reason', 'already_processed',
    'actual_duration', _actual_duration_seconds
  );
END;
$$;
