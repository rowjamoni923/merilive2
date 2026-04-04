CREATE OR REPLACE FUNCTION public.cleanup_stale_in_call_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1. Reset is_in_call for users whose current_call_id points to an ended/missed/declined/cancelled call
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc
  WHERE p.current_call_id = pc.id
    AND p.is_in_call = true
    AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');

  -- 2. Reset is_in_call for users whose current_call_id does not exist in private_calls
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE p.is_in_call = true
    AND p.current_call_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM private_calls pc WHERE pc.id = p.current_call_id);

  -- 3. Force-end calls that have been "connected" for more than 30 SECONDS without ended_at
  -- This is the SAFETY NET - real call ending happens via end_private_call RPC
  UPDATE private_calls
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected'
    AND started_at < now() - INTERVAL '30 seconds'
    AND ended_at IS NULL
    AND NOT EXISTS (
      -- Only end if NEITHER participant has this as their current_call_id with active heartbeat
      SELECT 1 FROM profiles p 
      WHERE p.current_call_id = private_calls.id 
        AND p.is_in_call = true
        AND p.last_seen_at > now() - INTERVAL '60 seconds'
    );

  -- 4. Force-end calls that have been "ringing/pending" for more than 60 seconds
  UPDATE private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status IN ('ringing', 'pending')
    AND started_at < now() - INTERVAL '60 seconds'
    AND ended_at IS NULL;

  -- 5. Reset is_in_call for users where is_in_call=true but current_call_id is NULL
  UPDATE profiles
  SET is_in_call = false, updated_at = now()
  WHERE is_in_call = true AND current_call_id IS NULL;

  -- 6. FINAL SWEEP: Re-check after ending stale calls above
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc
  WHERE p.current_call_id = pc.id
    AND p.is_in_call = true
    AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');
END;
$$;