-- Update start_private_call to not use fallback
CREATE OR REPLACE FUNCTION public.start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL)
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
  
  -- Get call rate from admin settings (NO FALLBACK - must be configured)
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  _host_call_rate := (_call_settings->>'default_rate')::integer;
  
  IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
    RAISE EXCEPTION 'Call rate not configured by admin';
  END IF;
  
  -- Create the call with 'ringing' status
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