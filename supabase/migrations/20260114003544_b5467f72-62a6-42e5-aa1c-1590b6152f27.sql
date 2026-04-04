-- Create private calls table for 1-to-1 calling
CREATE TABLE public.private_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID NOT NULL REFERENCES public.profiles(id),
  host_id UUID NOT NULL REFERENCES public.profiles(id),
  stream_id UUID REFERENCES public.live_streams(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'connected', 'ended', 'missed', 'declined')),
  started_at TIMESTAMP WITH TIME ZONE,
  connected_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  end_reason TEXT,
  duration_seconds INTEGER DEFAULT 0,
  coins_spent INTEGER DEFAULT 0,
  coins_per_minute INTEGER DEFAULT 60,
  caller_rating INTEGER CHECK (caller_rating >= 1 AND caller_rating <= 5),
  host_rating INTEGER CHECK (host_rating >= 1 AND host_rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call events table for admin monitoring
CREATE TABLE public.call_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.private_calls(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add call-related fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_in_call BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS current_call_id UUID,
ADD COLUMN IF NOT EXISTS call_rate_per_minute INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS total_call_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_calls_received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_calls_made INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.private_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE private_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE call_events;
ALTER TABLE private_calls REPLICA IDENTITY FULL;
ALTER TABLE call_events REPLICA IDENTITY FULL;

-- RLS Policies for private_calls
CREATE POLICY "Users can view their own calls"
ON public.private_calls
FOR SELECT
USING (auth.uid() = caller_id OR auth.uid() = host_id);

CREATE POLICY "Users can create calls"
ON public.private_calls
FOR INSERT
WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Participants can update call"
ON public.private_calls
FOR UPDATE
USING (auth.uid() = caller_id OR auth.uid() = host_id);

-- RLS Policies for call_events (for admin use, restricted access)
CREATE POLICY "Call participants can view events"
ON public.call_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.private_calls 
    WHERE id = call_events.call_id 
    AND (caller_id = auth.uid() OR host_id = auth.uid())
  )
);

CREATE POLICY "System can insert call events"
ON public.call_events
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.private_calls 
    WHERE id = call_events.call_id 
    AND (caller_id = auth.uid() OR host_id = auth.uid())
  )
);

-- Function to start a private call
CREATE OR REPLACE FUNCTION public.start_private_call(
  _host_id UUID,
  _stream_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_id UUID;
  _caller_id UUID;
  _host_call_rate INTEGER;
BEGIN
  _caller_id := auth.uid();
  
  -- Check if caller is not calling themselves
  IF _caller_id = _host_id THEN
    RAISE EXCEPTION 'Cannot call yourself';
  END IF;
  
  -- Check if host is available (not in another call)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'Host is busy in another call';
  END IF;
  
  -- Check if caller is available
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _caller_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;
  
  -- Get host's call rate
  SELECT COALESCE(call_rate_per_minute, 60) INTO _host_call_rate
  FROM profiles WHERE id = _host_id;
  
  -- Create the call
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Update caller status
  UPDATE profiles 
  SET is_in_call = true, current_call_id = _call_id
  WHERE id = _caller_id;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_initiated', jsonb_build_object(
    'caller_id', _caller_id,
    'host_id', _host_id,
    'stream_id', _stream_id
  ));
  
  RETURN _call_id;
END;
$$;

-- Function to accept a call
CREATE OR REPLACE FUNCTION public.accept_private_call(_call_id UUID)
RETURNS BOOLEAN
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
  
  -- Update call status
  UPDATE private_calls
  SET status = 'connected', connected_at = now()
  WHERE id = _call_id;
  
  -- Update host status
  UPDATE profiles
  SET is_in_call = true, current_call_id = _call_id
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

-- Function to end a call
CREATE OR REPLACE FUNCTION public.end_private_call(
  _call_id UUID,
  _end_reason TEXT DEFAULT 'normal'
)
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
  
  -- Calculate duration and coins
  IF _connected_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (now() - _connected_at))::INTEGER;
    _total_coins := CEIL(_duration::DECIMAL / 60) * _coins_per_minute;
  ELSE
    _duration := 0;
    _total_coins := 0;
  END IF;
  
  -- Update call
  UPDATE private_calls
  SET 
    status = 'ended',
    ended_at = now(),
    end_reason = _end_reason,
    duration_seconds = _duration,
    coins_spent = _total_coins
  WHERE id = _call_id;
  
  -- Update caller profile
  UPDATE profiles
  SET 
    is_in_call = false, 
    current_call_id = NULL,
    coins = GREATEST(COALESCE(coins, 0) - _total_coins, 0),
    total_calls_made = COALESCE(total_calls_made, 0) + 1
  WHERE id = _caller_id;
  
  -- Update host profile
  UPDATE profiles
  SET 
    is_in_call = false, 
    current_call_id = NULL,
    total_earnings = COALESCE(total_earnings, 0) + _total_coins,
    total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(_duration::DECIMAL / 60),
    total_calls_received = COALESCE(total_calls_received, 0) + 1
  WHERE id = _host_id;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_ended', jsonb_build_object(
    'end_reason', _end_reason,
    'duration_seconds', _duration,
    'coins_spent', _total_coins,
    'ended_by', auth.uid()
  ));
  
  RETURN TRUE;
END;
$$;

-- Function to decline a call
CREATE OR REPLACE FUNCTION public.decline_private_call(_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id UUID;
  _host_id UUID;
BEGIN
  -- Get call info
  SELECT caller_id, host_id INTO _caller_id, _host_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;
  
  -- Update call status
  UPDATE private_calls
  SET status = 'declined', ended_at = now(), end_reason = 'declined'
  WHERE id = _call_id;
  
  -- Update caller status
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL
  WHERE id = _caller_id;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_declined', jsonb_build_object('host_id', _host_id));
  
  RETURN TRUE;
END;
$$;