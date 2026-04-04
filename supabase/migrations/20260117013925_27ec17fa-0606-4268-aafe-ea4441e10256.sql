-- Add missing columns for call billing tracking
ALTER TABLE private_calls 
ADD COLUMN IF NOT EXISTS total_coins_deducted integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS host_earned integer DEFAULT 0;

-- Update the RPC function to use existing columns
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
  
  -- Calculate host share (beans)
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
  
  -- Update call record with both new columns and existing columns
  UPDATE private_calls 
  SET 
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_share,
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_share
  WHERE id = _call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_share,
    'caller_remaining', _caller_coins - _coins_to_deduct
  );
END;
$$;