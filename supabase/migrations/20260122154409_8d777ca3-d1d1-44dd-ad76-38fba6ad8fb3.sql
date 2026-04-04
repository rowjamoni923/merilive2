-- Update start_private_call to use host's custom rate OR admin default
CREATE OR REPLACE FUNCTION public.start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _call_id uuid;
  _host_call_rate integer;
  _admin_default_rate integer;
  _admin_min_rate integer;
  _admin_max_rate integer;
  _call_settings jsonb;
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
  
  -- Get admin settings for rate limits
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  _admin_default_rate := COALESCE((_call_settings->>'default_rate')::integer, 2000);
  _admin_min_rate := COALESCE((_call_settings->>'min_rate')::integer, 30);
  _admin_max_rate := COALESCE((_call_settings->>'max_rate')::integer, 10000);
  
  -- Get host's custom call rate (if set), otherwise use admin default
  SELECT COALESCE(call_rate_per_minute, _admin_default_rate) INTO _host_call_rate
  FROM profiles WHERE id = _host_id;
  
  -- Ensure host rate is within admin limits
  IF _host_call_rate < _admin_min_rate THEN
    _host_call_rate := _admin_min_rate;
  END IF;
  IF _host_call_rate > _admin_max_rate THEN
    _host_call_rate := _admin_max_rate;
  END IF;
  
  -- Create the call with host's rate
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Mark users as in call
  UPDATE profiles SET is_in_call = true, current_call_id = _call_id WHERE id IN (_caller_id, _host_id);
  
  RETURN _call_id;
END;
$$;

-- Update deduct_call_coins_per_minute to properly handle commission
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record RECORD;
  _caller_coins integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _company_share integer;
  _host_commission_percent integer;
  _call_settings jsonb;
BEGIN
  -- Get call details
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = _call_id AND status = 'connected';
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found or not connected');
  END IF;
  
  -- Get caller's current coins (diamonds)
  SELECT coins INTO _caller_coins
  FROM profiles WHERE id = _call_record.caller_id;
  
  -- Get admin settings for commission rate
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  -- Commission percentage from admin (default 60%)
  _host_commission_percent := COALESCE((_call_settings->>'host_commission_percent')::integer, 60);
  
  -- Coins to deduct = call rate set for this call (from host's rate or admin default)
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- Check if caller has enough coins
  IF _caller_coins < _coins_to_deduct THEN
    -- End call due to insufficient funds
    UPDATE private_calls 
    SET status = 'ended', ended_at = now(), end_reason = 'insufficient_funds'
    WHERE id = _call_id;
    
    UPDATE profiles SET is_in_call = false, current_call_id = NULL 
    WHERE id IN (_call_record.caller_id, _call_record.host_id);
    
    RETURN jsonb_build_object('success', false, 'call_ended', true, 'reason', 'insufficient_funds');
  END IF;
  
  -- Calculate host's beans (commission % of coins deducted)
  -- Example: 2000 coins * 60% = 1200 beans to host
  _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  _company_share := _coins_to_deduct - _host_beans;
  
  -- Deduct coins (diamonds) from caller
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct, updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host
  UPDATE profiles 
  SET beans = COALESCE(beans, 0) + _host_beans, updated_at = now()
  WHERE id = _call_record.host_id;
  
  -- Update call record with billing info
  UPDATE private_calls 
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60
  WHERE id = _call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_beans', _host_beans,
    'company_share', _company_share,
    'caller_remaining', _caller_coins - _coins_to_deduct,
    'host_commission_percent', _host_commission_percent
  );
END;
$$;