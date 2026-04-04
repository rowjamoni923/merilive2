
-- Fix: Auto-cancel any stale pending/ringing calls before creating new one
-- This prevents old calls from reconnecting when user calls the same host again
CREATE OR REPLACE FUNCTION public.start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _caller_id uuid;
  _call_id uuid;
  _host_call_rate integer;
  _host_level integer;
  _host_custom_rate integer;
  _call_settings jsonb;
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
  
  -- ✅ FIX: Auto-cancel ANY stale pending/ringing calls from this caller to this host
  -- This prevents old calls from being picked up by polling/broadcast
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = now(), 
      end_reason = 'cancelled_by_new_call',
      updated_at = now()
  WHERE caller_id = _caller_id 
    AND host_id = _host_id 
    AND status IN ('pending', 'ringing');
  
  -- ✅ FIX: Also cancel any stale calls where this caller is involved
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = now(), 
      end_reason = 'cancelled_stale',
      updated_at = now()
  WHERE caller_id = _caller_id 
    AND status IN ('pending', 'ringing')
    AND created_at < now() - interval '60 seconds';

  -- ✅ FIX: Cancel stale calls where host is the receiver
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = now(), 
      end_reason = 'cancelled_stale',
      updated_at = now()
  WHERE host_id = _host_id 
    AND status IN ('pending', 'ringing')
    AND created_at < now() - interval '60 seconds';
  
  -- Reset is_in_call for both users before checking
  UPDATE profiles SET is_in_call = false, current_call_id = null, updated_at = now()
  WHERE id = _caller_id 
    AND is_in_call = true
    AND (current_call_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM private_calls WHERE id = current_call_id AND status IN ('connected', 'ringing')
    ));

  UPDATE profiles SET is_in_call = false, current_call_id = null, updated_at = now()
  WHERE id = _host_id 
    AND is_in_call = true
    AND (current_call_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM private_calls WHERE id = current_call_id AND status IN ('connected', 'ringing')
    ));
  
  -- Check if caller is GENUINELY in an active call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _caller_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;
  
  -- Check if host is GENUINELY in an active call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'Host is busy in another call';
  END IF;
  
  -- CRITICAL: Get admin settings
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  IF _call_settings IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: call_rates not configured in Admin Panel!';
  END IF;
  
  _admin_min_rate := (_call_settings->>'min_rate')::integer;
  _admin_max_rate := (_call_settings->>'max_rate')::integer;
  
  _min_level_for_custom := COALESCE(
    (_call_settings->>'min_level_for_custom_rate')::integer,
    (_call_settings->>'min_level_for_custom')::integer,
    3
  );
  
  IF _admin_min_rate IS NULL OR _admin_max_rate IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: min_rate and max_rate must be configured!';
  END IF;
  
  -- FIX: Use host_level (not user_level) for hosts to determine correct rate
  SELECT host_level, call_rate_per_minute INTO _host_level, _host_custom_rate
  FROM profiles WHERE id = _host_id;
  
  _host_level := COALESCE(_host_level, 0);
  
  -- PRIORITY 1: Host custom rate (only if level >= min_level_for_custom)
  IF _host_custom_rate IS NOT NULL AND _host_custom_rate > 0 AND _host_level >= _min_level_for_custom THEN
    _host_call_rate := GREATEST(_admin_min_rate, LEAST(_host_custom_rate, _admin_max_rate));
  ELSE
    -- PRIORITY 2: Level-based rate from admin settings
    IF _call_settings->'level_rates' IS NOT NULL AND jsonb_array_length(_call_settings->'level_rates') > 0 THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates') - 1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = _host_level THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          _is_level_rate := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- If no exact level match found, use default_rate from admin
    IF NOT _is_level_rate OR _host_call_rate IS NULL THEN
      _host_call_rate := COALESCE((_call_settings->>'default_rate')::integer, 0);
      IF _host_call_rate <= 0 THEN
        RAISE EXCEPTION 'No call rate configured for host level %', _host_level;
      END IF;
    END IF;
  END IF;
  
  IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
    RAISE EXCEPTION 'Invalid call rate';
  END IF;
  
  -- Create the call
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Mark BOTH caller and host as in_call immediately
  UPDATE profiles SET is_in_call = true, current_call_id = _call_id, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  RETURN _call_id;
END;
$function$;
