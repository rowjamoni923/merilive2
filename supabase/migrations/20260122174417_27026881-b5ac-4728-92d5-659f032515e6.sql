-- Update start_private_call function to use host's custom call rate first
CREATE OR REPLACE FUNCTION public.start_private_call(
  _caller_id uuid,
  _host_id uuid,
  _stream_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_id uuid;
  _caller_coins integer;
  _host_call_rate integer;
  _call_settings jsonb;
  _host_level integer;
  _level_rate jsonb;
  _i integer;
BEGIN
  -- Check if caller has enough coins
  SELECT coins INTO _caller_coins FROM profiles WHERE id = _caller_id;
  
  -- First try to get host's custom call rate from their profile
  SELECT call_rate_per_minute, user_level INTO _host_call_rate, _host_level
  FROM profiles WHERE id = _host_id;
  
  -- If host has NOT set a custom rate, use admin settings
  IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
    SELECT setting_value INTO _call_settings
    FROM app_settings WHERE setting_key = 'call_rates';
    
    -- Try level-based rates first
    IF _call_settings->'level_rates' IS NOT NULL AND jsonb_array_length(_call_settings->'level_rates') > 0 THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates')-1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = COALESCE(_host_level, 1) THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- Fallback to default rate
    IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
      _host_call_rate := COALESCE((_call_settings->>'default_rate')::integer, 2000);
    END IF;
  END IF;
  
  IF _caller_coins < _host_call_rate THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins', 'required', _host_call_rate);
  END IF;
  
  -- Create the call with host's actual rate
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _host_call_rate);
END;
$$;