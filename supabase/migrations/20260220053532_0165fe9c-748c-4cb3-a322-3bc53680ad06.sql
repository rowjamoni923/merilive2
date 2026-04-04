-- Add heartbeat column to live_streams
ALTER TABLE public.live_streams 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create index for stale stream detection
CREATE INDEX IF NOT EXISTS idx_live_streams_active_heartbeat 
ON public.live_streams (is_active, last_heartbeat) 
WHERE is_active = true;

-- Function to cleanup stale streams (no heartbeat for 60 seconds)
CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE live_streams
  SET is_active = false, ended_at = now()
  WHERE is_active = true
    AND last_heartbeat < now() - interval '60 seconds';
  
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

-- Function for host to update heartbeat (called via RPC)
CREATE OR REPLACE FUNCTION public.update_stream_heartbeat(stream_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE live_streams
  SET last_heartbeat = now()
  WHERE id = stream_id 
    AND is_active = true
    AND host_id = auth.uid();
END;
$$;

-- Allow RLS policy for hosts to update their own stream heartbeat
-- (The SECURITY DEFINER functions bypass RLS, so no extra policy needed)
