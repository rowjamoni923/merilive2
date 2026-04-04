-- Function to deduct coins per minute during active call
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(
  _call_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id UUID;
  _host_id UUID;
  _coins_per_minute INTEGER;
  _caller_coins INTEGER;
  _host_commission_percent NUMERIC;
  _host_earnings INTEGER;
  _call_rates JSONB;
  _result JSONB;
BEGIN
  -- Get call info and verify it's connected
  SELECT caller_id, host_id, coins_per_minute
  INTO _caller_id, _host_id, _coins_per_minute
  FROM private_calls
  WHERE id = _call_id AND status = 'connected';
  
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found or not connected');
  END IF;
  
  -- Verify user is participant
  IF auth.uid() != _caller_id AND auth.uid() != _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get caller's current coins
  SELECT COALESCE(coins, 0) INTO _caller_coins
  FROM profiles WHERE id = _caller_id;
  
  -- Check if caller has enough coins
  IF _caller_coins < _coins_per_minute THEN
    -- Auto end call due to insufficient funds
    PERFORM end_private_call(_call_id, 'insufficient_funds');
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient coins',
      'call_ended', true
    );
  END IF;
  
  -- Get host commission percentage from app_settings
  SELECT setting_value INTO _call_rates
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  _host_commission_percent := COALESCE((_call_rates->>'host_commission_percent')::NUMERIC, 40);
  _host_earnings := FLOOR(_coins_per_minute * _host_commission_percent / 100);
  
  -- Deduct coins from caller
  UPDATE profiles
  SET 
    coins = GREATEST(COALESCE(coins, 0) - _coins_per_minute, 0),
    total_consumption = COALESCE(total_consumption, 0) + _coins_per_minute
  WHERE id = _caller_id;
  
  -- Add beans/earnings to host
  UPDATE profiles
  SET 
    total_earnings = COALESCE(total_earnings, 0) + _host_earnings,
    total_call_minutes = COALESCE(total_call_minutes, 0) + 1
  WHERE id = _host_id;
  
  -- Update call with incremented coins spent
  UPDATE private_calls
  SET coins_spent = COALESCE(coins_spent, 0) + _coins_per_minute
  WHERE id = _call_id;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'minute_charged', jsonb_build_object(
    'coins_deducted', _coins_per_minute,
    'host_earned', _host_earnings,
    'caller_remaining', _caller_coins - _coins_per_minute
  ));
  
  _result := jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_per_minute,
    'host_earned', _host_earnings,
    'caller_remaining', _caller_coins - _coins_per_minute
  );
  
  RETURN _result;
END;
$$;

-- Add function for detecting phone numbers in chat/calls
CREATE OR REPLACE FUNCTION public.log_phone_number_violation(
  _user_id UUID,
  _detected_content TEXT,
  _context_type TEXT DEFAULT 'call'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _violation_count INTEGER;
  _auto_ban_threshold INTEGER;
  _action_taken TEXT;
BEGIN
  -- Get auto-ban threshold from settings
  SELECT COALESCE((setting_value)::INTEGER, 3) INTO _auto_ban_threshold
  FROM app_settings
  WHERE setting_key = 'auto_ban_phone_threshold';
  
  IF _auto_ban_threshold IS NULL THEN
    _auto_ban_threshold := 3;
  END IF;
  
  -- Get current violation count
  SELECT COALESCE(phone_violation_count, 0) + 1 INTO _violation_count
  FROM profiles WHERE id = _user_id;
  
  -- Update violation count
  UPDATE profiles
  SET phone_violation_count = _violation_count
  WHERE id = _user_id;
  
  -- Determine action
  IF _violation_count >= _auto_ban_threshold THEN
    _action_taken := 'auto_ban';
    -- Ban the user
    UPDATE profiles
    SET 
      is_blocked = true,
      blocked_at = now(),
      blocked_reason = 'Auto-banned for sharing phone number ' || _violation_count || ' times'
    WHERE id = _user_id;
  ELSE
    _action_taken := 'warning';
  END IF;
  
  -- Log the violation
  INSERT INTO chat_moderation_logs (
    user_id,
    violation_type,
    detected_content,
    action_taken,
    is_auto_action,
    notes
  ) VALUES (
    _user_id,
    'phone_number_' || _context_type,
    _detected_content,
    _action_taken,
    true,
    'Detected during ' || _context_type || '. Violation #' || _violation_count
  );
  
  RETURN jsonb_build_object(
    'violation_count', _violation_count,
    'action_taken', _action_taken,
    'is_banned', _violation_count >= _auto_ban_threshold
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.deduct_call_coins_per_minute TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_phone_number_violation TO authenticated;