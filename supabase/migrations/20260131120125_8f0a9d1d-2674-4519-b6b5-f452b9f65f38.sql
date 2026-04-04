
-- Update the deduct_call_coins_per_minute function to implement grace period
-- NEW RULES:
-- 1. First 40 seconds: User coins deducted, company keeps all, host gets 0
-- 2. After 40 seconds (until 60 seconds): User coins deducted, host gets commission
-- 3. After 1 minute: Normal billing every 60 seconds with full host commission

CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  _grace_period_seconds integer := 40; -- Host grace period: first 40 seconds = no host earnings
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
  
  -- Prevent double billing within 50 seconds
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;
  
  -- CRITICAL: Get commission from Admin Panel - NO DEFAULTS
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    RAISE WARNING 'CRITICAL: call_rates.host_commission_percent not configured in Admin Panel!';
    _host_commission_percent := 0; -- Safe fallback - company retains all
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  -- Use the EXACT coins_per_minute stored in the call record
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- GRACE PERIOD LOGIC:
  -- First billing (0-60 seconds): If current duration < 40 seconds, host gets 0
  -- Subsequent billings: Normal host commission
  IF _call_duration_seconds < _grace_period_seconds THEN
    -- First minute, within grace period: Company keeps everything
    _host_beans := 0;
    RAISE NOTICE 'Grace period active: %s seconds, host gets 0 beans', _call_duration_seconds;
  ELSE
    -- Past grace period or subsequent minutes: Normal host commission
    _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  END IF;
  
  -- Check caller balance
  SELECT coins INTO _caller_balance
  FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
    UPDATE private_calls 
    SET status = 'ended', ended_at = now()
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
    'grace_period_active', _call_duration_seconds < _grace_period_seconds
  );
END;
$$;
