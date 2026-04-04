-- Fix: Update deduct_call_coins_per_minute to properly accumulate earnings
-- AND add free call duration logic (no host earnings for calls under threshold)

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
  _free_call_duration_seconds integer;
  _current_duration integer;
  _is_free_period boolean;
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
  
  -- Get admin settings for commission rate and free call duration
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  -- Commission percentage from admin (default 55%)
  _host_commission_percent := COALESCE((_call_settings->>'host_commission_percent')::integer, 55);
  
  -- Free call duration in seconds (calls under this = no host earnings)
  _free_call_duration_seconds := COALESCE((_call_settings->>'free_call_duration_seconds')::integer, 40);
  
  -- Coins to deduct = call rate set for this call
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- Get current call duration (how long call has been going)
  _current_duration := COALESCE(_call_record.duration_seconds, 0);
  
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
  
  -- Deduct coins (diamonds) from caller ALWAYS
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct, updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Check if we're still in free period (under threshold)
  -- For first minute deduction: _current_duration is 0, add 60 = 60 seconds
  -- If free_call_duration is 40, then 60 > 40 so host gets paid
  -- But if call ends at 30 seconds, duration_seconds will be ~30, which is < 40
  _is_free_period := (_current_duration + 60) <= _free_call_duration_seconds;
  
  IF _is_free_period THEN
    -- Call is under free threshold - company keeps ALL coins, host gets nothing
    _host_beans := 0;
    _company_share := _coins_to_deduct;
    
    -- Update call record - caller charged but host NOT credited
    UPDATE private_calls 
    SET 
      coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
      total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
      -- host_earned stays same (or 0)
      duration_seconds = COALESCE(duration_seconds, 0) + 60
    WHERE id = _call_id;
  ELSE
    -- Normal billing - host gets their commission
    _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
    _company_share := _coins_to_deduct - _host_beans;
    
    -- Add beans to host
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _host_beans, updated_at = now()
    WHERE id = _call_record.host_id;
    
    -- Update call record with billing info (accumulate properly)
    UPDATE private_calls 
    SET 
      coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
      host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
      total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
      host_earned = COALESCE(host_earned, 0) + _host_beans,
      duration_seconds = COALESCE(duration_seconds, 0) + 60
    WHERE id = _call_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_beans', _host_beans,
    'company_share', _company_share,
    'caller_remaining', _caller_coins - _coins_to_deduct,
    'host_commission_percent', _host_commission_percent,
    'is_free_period', _is_free_period,
    'current_duration', _current_duration
  );
END;
$$;