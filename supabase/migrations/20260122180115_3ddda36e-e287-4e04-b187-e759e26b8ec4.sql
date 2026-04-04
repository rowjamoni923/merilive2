-- Fix: The start_private_call function should NOT clamp level-based rates
-- Only clamp custom rates (when host sets their own rate above/below limits)

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
  _host_level integer;
  _call_settings jsonb;
  _admin_default_rate integer;
  _admin_min_rate integer;
  _admin_max_rate integer;
  _min_level_for_custom integer;
  _level_rate jsonb;
  _i integer;
  _is_level_rate boolean := false;
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
  
  -- Get admin settings
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  _admin_default_rate := COALESCE((_call_settings->>'default_rate')::integer, 2000);
  _admin_min_rate := COALESCE((_call_settings->>'min_rate')::integer, 30);
  _admin_max_rate := COALESCE((_call_settings->>'max_rate')::integer, 10000);
  _min_level_for_custom := COALESCE((_call_settings->>'min_level_for_custom_rate')::integer, 7);
  
  -- Get host's profile
  SELECT call_rate_per_minute, user_level INTO _host_call_rate, _host_level
  FROM profiles WHERE id = _host_id;
  
  -- PRIORITY 1: Check if host is eligible for custom rate AND has set one
  IF _host_level >= _min_level_for_custom AND _host_call_rate IS NOT NULL AND _host_call_rate > 0 THEN
    -- Host is level 7+ with custom rate - apply min/max clamping
    IF _host_call_rate < _admin_min_rate THEN
      _host_call_rate := _admin_min_rate;
    END IF;
    IF _host_call_rate > _admin_max_rate THEN
      _host_call_rate := _admin_max_rate;
    END IF;
  ELSE
    -- Host is below min level for custom OR hasn't set a rate
    -- Use level-based rate (do NOT clamp - admin sets these)
    _is_level_rate := true;
    _host_call_rate := NULL;
    
    IF _call_settings->'level_rates' IS NOT NULL THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates')-1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = COALESCE(_host_level, 1) THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- Fallback to default rate if no level rate found
    IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
      _host_call_rate := _admin_default_rate;
    END IF;
  END IF;
  
  -- Create the call with the determined rate
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Mark users as in call
  UPDATE profiles SET is_in_call = true, current_call_id = _call_id WHERE id IN (_caller_id, _host_id);
  
  RETURN _call_id;
END;
$$;