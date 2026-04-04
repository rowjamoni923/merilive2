-- Fix deduct_call_coins_per_minute to prevent double deductions in same minute
-- Add a last_billing_minute column to track which minutes have been billed

-- First add tracking column to private_calls
ALTER TABLE public.private_calls 
ADD COLUMN IF NOT EXISTS last_billing_at TIMESTAMP WITH TIME ZONE;

-- Now recreate the function with double-deduction prevention
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
  _time_since_last_billing integer;
BEGIN
  -- Get call details with row lock to prevent race conditions
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = _call_id AND status = 'connected'
  FOR UPDATE;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found or not connected');
  END IF;
  
  -- CRITICAL: Prevent double billing within same minute
  -- Allow billing only if: never billed OR 50+ seconds since last billing
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      -- Already billed in last 50 seconds - skip to prevent double charge
      RETURN jsonb_build_object(
        'success', true, 
        'skipped', true,
        'reason', 'Already billed ' || _time_since_last_billing || 's ago'
      );
    END IF;
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
  _is_free_period := (_current_duration + 60) <= _free_call_duration_seconds;
  
  IF _is_free_period THEN
    -- Call is under free threshold - company keeps ALL coins, host gets nothing
    _host_beans := 0;
    _company_share := _coins_to_deduct;
    
    UPDATE private_calls 
    SET 
      coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
      total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
      duration_seconds = COALESCE(duration_seconds, 0) + 60,
      last_billing_at = now()
    WHERE id = _call_id;
  ELSE
    -- Normal billing - host gets their commission
    _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
    _company_share := _coins_to_deduct - _host_beans;
    
    -- Add beans to host
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _host_beans, updated_at = now()
    WHERE id = _call_record.host_id;
    
    UPDATE private_calls 
    SET 
      coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
      host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
      total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
      host_earned = COALESCE(host_earned, 0) + _host_beans,
      duration_seconds = COALESCE(duration_seconds, 0) + 60,
      last_billing_at = now()
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