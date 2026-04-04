-- Update the end_private_call function to support host commission percentage
CREATE OR REPLACE FUNCTION public.end_private_call(_call_id UUID, _end_reason TEXT DEFAULT 'normal')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id UUID;
  _host_id UUID;
  _connected_at TIMESTAMP WITH TIME ZONE;
  _duration INTEGER;
  _coins_per_minute INTEGER;
  _total_coins INTEGER;
  _host_earnings INTEGER;
  _host_commission_percent NUMERIC;
  _call_rates JSONB;
BEGIN
  -- Get call info
  SELECT caller_id, host_id, connected_at, coins_per_minute
  INTO _caller_id, _host_id, _connected_at, _coins_per_minute
  FROM private_calls
  WHERE id = _call_id AND status IN ('ringing', 'connected');
  
  IF _caller_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Verify user is participant
  IF auth.uid() != _caller_id AND auth.uid() != _host_id THEN
    RAISE EXCEPTION 'Not authorized to end this call';
  END IF;
  
  -- Get host commission percentage from app_settings
  SELECT setting_value INTO _call_rates
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  -- Default to 40% if not set
  _host_commission_percent := COALESCE((_call_rates->>'host_commission_percent')::NUMERIC, 40);
  
  -- Calculate duration and coins
  IF _connected_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (now() - _connected_at))::INTEGER;
    _total_coins := CEIL(_duration::DECIMAL / 60) * _coins_per_minute;
    -- Calculate host earnings based on commission percentage
    _host_earnings := FLOOR(_total_coins * _host_commission_percent / 100);
  ELSE
    _duration := 0;
    _total_coins := 0;
    _host_earnings := 0;
  END IF;
  
  -- Update call with both user spent and host earned
  UPDATE private_calls
  SET 
    status = 'ended',
    ended_at = now(),
    end_reason = _end_reason,
    duration_seconds = _duration,
    coins_spent = _total_coins
  WHERE id = _call_id;
  
  -- Update caller profile - deduct full coins
  UPDATE profiles
  SET 
    is_in_call = false, 
    current_call_id = NULL,
    coins = GREATEST(COALESCE(coins, 0) - _total_coins, 0),
    total_consumption = COALESCE(total_consumption, 0) + _total_coins,
    total_calls_made = COALESCE(total_calls_made, 0) + 1
  WHERE id = _caller_id;
  
  -- Update host profile - add only commission percentage as beans/earnings
  UPDATE profiles
  SET 
    is_in_call = false, 
    current_call_id = NULL,
    total_earnings = COALESCE(total_earnings, 0) + _host_earnings,
    total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(_duration::DECIMAL / 60),
    total_calls_received = COALESCE(total_calls_received, 0) + 1
  WHERE id = _host_id;
  
  -- Log event with detailed earnings info
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_ended', jsonb_build_object(
    'end_reason', _end_reason,
    'duration_seconds', _duration,
    'coins_spent', _total_coins,
    'host_earnings', _host_earnings,
    'host_commission_percent', _host_commission_percent,
    'ended_by', auth.uid()
  ));
  
  RETURN TRUE;
END;
$$;