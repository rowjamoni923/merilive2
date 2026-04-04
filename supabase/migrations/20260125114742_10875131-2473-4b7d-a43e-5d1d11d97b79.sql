-- Fix the deduct_call_coins_per_minute function
-- The column name is 'host_id', not 'receiver_id'
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
  _host_commission_percent integer := 55;
  _time_since_last_billing integer;
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
  
  -- Prevent double billing within 50 seconds
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;
  
  -- Get admin commission setting (55% host, 45% company from Admin Panel)
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _settings IS NOT NULL THEN
    _host_commission_percent := COALESCE((_settings->>'host_commission_percent')::integer, 55);
  END IF;
  
  -- Use the EXACT coins_per_minute stored in the call record
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- Calculate host beans: 55% of 2000 = 1100 beans
  _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  
  -- Check caller balance
  SELECT diamond_balance INTO _caller_balance
  FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
    UPDATE private_calls 
    SET status = 'ended', ended_at = now()
    WHERE id = p_call_id;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'caller_balance', _caller_balance,
      'required', _coins_to_deduct
    );
  END IF;
  
  -- Deduct from caller
  UPDATE profiles 
  SET diamond_balance = diamond_balance - _coins_to_deduct,
      updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host (FIXED: using host_id instead of receiver_id)
  UPDATE profiles 
  SET beans = COALESCE(beans, 0) + _host_beans,
      weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
      total_earnings = COALESCE(total_earnings, 0) + _host_beans,
      updated_at = now()
  WHERE id = _call_record.host_id;
  
  -- Update call record
  UPDATE private_calls
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60,
    last_billing_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'deducted', _coins_to_deduct,
    'host_beans', _host_beans,
    'commission_percent', _host_commission_percent,
    'caller_remaining', _caller_balance - _coins_to_deduct
  );
END;
$$;