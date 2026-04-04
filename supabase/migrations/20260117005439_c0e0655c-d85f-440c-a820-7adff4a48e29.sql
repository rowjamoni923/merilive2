-- Update accept_private_call to set search_path
CREATE OR REPLACE FUNCTION public.accept_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_id UUID;
  _stream_id UUID;
BEGIN
  -- Get call info and verify host
  SELECT host_id, stream_id INTO _host_id, _stream_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;
  
  -- Update call status to connected
  UPDATE private_calls
  SET status = 'connected', connected_at = now()
  WHERE id = _call_id;
  
  -- Update host status
  UPDATE profiles
  SET is_in_call = true, current_call_id = _call_id, updated_at = now()
  WHERE id = _host_id;
  
  -- If there was a stream, end it (convert to private call)
  IF _stream_id IS NOT NULL THEN
    UPDATE live_streams
    SET is_active = false, ended_at = now()
    WHERE id = _stream_id;
  END IF;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_accepted', jsonb_build_object('host_id', _host_id));
  
  RETURN TRUE;
END;
$$;