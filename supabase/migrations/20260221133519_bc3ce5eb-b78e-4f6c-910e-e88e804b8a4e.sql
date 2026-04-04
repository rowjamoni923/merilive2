
-- FIX 1: end_private_call should NOT re-deduct coins (per-minute billing already handles it)
-- It should only: update call status, reset is_in_call flags, log the event
CREATE OR REPLACE FUNCTION public.end_private_call(_call_id uuid, _end_reason text DEFAULT 'normal'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id UUID;
  _host_id UUID;
  _started_at TIMESTAMP WITH TIME ZONE;
  _connected_at TIMESTAMP WITH TIME ZONE;
  _duration INTEGER;
  _total_deducted INTEGER;
  _host_earned_val INTEGER;
  _call_status TEXT;
BEGIN
  -- Get call info
  SELECT caller_id, host_id, started_at, connected_at, status,
         COALESCE(total_coins_deducted, 0), COALESCE(host_earned, 0)
  INTO _caller_id, _host_id, _started_at, _connected_at, _call_status,
       _total_deducted, _host_earned_val
  FROM private_calls
  WHERE id = _call_id AND status IN ('ringing', 'connected');
  
  IF _caller_id IS NULL THEN
    -- Call already ended or not found - still reset is_in_call as safety
    UPDATE profiles 
    SET is_in_call = false, current_call_id = NULL 
    WHERE current_call_id = _call_id;
    RETURN FALSE;
  END IF;
  
  -- Verify user is participant
  IF auth.uid() != _caller_id AND auth.uid() != _host_id THEN
    RAISE EXCEPTION 'Not authorized to end this call';
  END IF;
  
  -- Calculate accurate duration from connected_at
  IF _connected_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (now() - _connected_at))::INTEGER;
  ELSIF _started_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (now() - _started_at))::INTEGER;
  ELSE
    _duration := 0;
  END IF;
  
  -- Update call status - DO NOT re-deduct coins (per-minute billing already did that)
  UPDATE private_calls
  SET 
    status = 'ended',
    ended_at = now(),
    end_reason = _end_reason,
    duration_seconds = _duration
  WHERE id = _call_id;
  
  -- INSTANTLY reset BOTH caller and host is_in_call flags
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  -- Update call stats (no coin deduction, just counters)
  UPDATE profiles
  SET total_calls_made = COALESCE(total_calls_made, 0) + 1
  WHERE id = _caller_id;
  
  UPDATE profiles
  SET total_calls_received = COALESCE(total_calls_received, 0) + 1,
      total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(GREATEST(_duration, 0)::DECIMAL / 60)
  WHERE id = _host_id;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_ended', jsonb_build_object(
    'end_reason', _end_reason,
    'duration_seconds', _duration,
    'total_coins_deducted', _total_deducted,
    'host_earned', _host_earned_val,
    'ended_by', auth.uid()
  ));
  
  RETURN TRUE;
END;
$function$;

-- FIX 2: Create a function to handle call timeout (missed calls)
CREATE OR REPLACE FUNCTION public.timeout_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id UUID;
  _host_id UUID;
BEGIN
  -- Only timeout calls that are still ringing
  SELECT caller_id, host_id INTO _caller_id, _host_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _caller_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Mark as missed
  UPDATE private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE id = _call_id AND status = 'ringing';
  
  -- INSTANTLY reset both users
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_missed', jsonb_build_object('reason', 'timeout'));
  
  RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.timeout_private_call TO authenticated;

-- FIX 3: Create a safety function to reset is_in_call for current user
CREATE OR REPLACE FUNCTION public.reset_my_call_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE id = auth.uid() AND is_in_call = true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_my_call_status TO authenticated;
