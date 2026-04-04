-- Update start_private_call function to use admin settings for call rate
CREATE OR REPLACE FUNCTION start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _call_id uuid;
  _caller_coins integer;
  _host_call_rate integer;
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
  IF EXISTS (
    SELECT 1 FROM profiles WHERE id = _caller_id AND is_in_call = true
  ) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;
  
  -- Get call rate from admin settings (not from host profile)
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  _host_call_rate := COALESCE((_call_settings->>'default_rate')::integer, 100);
  
  -- Create the call
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Update caller's status
  UPDATE profiles 
  SET is_in_call = true, updated_at = now() 
  WHERE id = _caller_id;
  
  RETURN _call_id;
END;
$$;

-- Also update deduct_call_coins_per_minute to use admin settings
CREATE OR REPLACE FUNCTION deduct_call_coins_per_minute(_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record RECORD;
  _caller_coins integer;
  _coins_to_deduct integer;
  _host_share integer;
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
  
  -- Get caller's current coins
  SELECT coins INTO _caller_coins
  FROM profiles WHERE id = _call_record.caller_id;
  
  -- Get call settings for commission rate
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  _host_commission_percent := COALESCE((_call_settings->>'host_commission_percent')::integer, 60);
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- Check if caller has enough coins
  IF _caller_coins < _coins_to_deduct THEN
    -- End call due to insufficient funds
    UPDATE private_calls 
    SET status = 'ended', ended_at = now(), end_reason = 'insufficient_funds'
    WHERE id = _call_id;
    
    UPDATE profiles SET is_in_call = false WHERE id IN (_call_record.caller_id, _call_record.host_id);
    
    RETURN jsonb_build_object('success', false, 'call_ended', true, 'reason', 'insufficient_funds');
  END IF;
  
  -- Calculate host share
  _host_share := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  _company_share := _coins_to_deduct - _host_share;
  
  -- Deduct from caller
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct, updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host (converted from coins)
  UPDATE profiles 
  SET beans = beans + _host_share, updated_at = now()
  WHERE id = _call_record.host_id;
  
  -- Update call record
  UPDATE private_calls 
  SET 
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_share
  WHERE id = _call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_share,
    'caller_remaining', _caller_coins - _coins_to_deduct
  );
END;
$$;