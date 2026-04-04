-- Update min_level_for_custom_rate to 6 in app_settings
UPDATE app_settings 
SET setting_value = jsonb_set(
  setting_value, 
  '{min_level_for_custom_rate}', 
  '6'::jsonb
)
WHERE setting_key = 'call_rates';

-- Fix start_private_call function to correctly use host's custom rate
-- Custom rate is used for Level 6+ hosts who have set their own rate
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
  _host_custom_rate integer;
  _host_level integer;
  _call_settings jsonb;
  _admin_default_rate integer;
  _admin_min_rate integer;
  _admin_max_rate integer;
  _min_level_for_custom integer;
  _level_rate jsonb;
  _i integer;
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
  _min_level_for_custom := COALESCE((_call_settings->>'min_level_for_custom_rate')::integer, 6);
  
  -- Get host's profile (custom rate and level)
  SELECT call_rate_per_minute, user_level INTO _host_custom_rate, _host_level
  FROM profiles WHERE id = _host_id;
  
  _host_level := COALESCE(_host_level, 1);
  
  -- PRIORITY LOGIC:
  -- 1. If host is Level 6+ AND has set a custom rate > 0, use their custom rate (clamped to min/max)
  -- 2. Otherwise, use the level-based rate from admin settings
  
  IF _host_level >= _min_level_for_custom AND _host_custom_rate IS NOT NULL AND _host_custom_rate > 0 THEN
    -- Host is Level 6+ with custom rate - use it (but clamp to admin limits)
    _host_call_rate := GREATEST(LEAST(_host_custom_rate, _admin_max_rate), _admin_min_rate);
    RAISE NOTICE 'Using host custom rate: % (clamped from %)', _host_call_rate, _host_custom_rate;
  ELSE
    -- Use level-based rate from admin settings
    _host_call_rate := _admin_default_rate; -- Default fallback
    
    IF _call_settings->'level_rates' IS NOT NULL THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates')-1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = _host_level THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    RAISE NOTICE 'Using level-based rate: % for level %', _host_call_rate, _host_level;
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