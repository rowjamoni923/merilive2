-- Fix stuck call RIGHT NOW
UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'cleanup' WHERE id = 'd6e70aea-c5a8-4802-a95a-58bd87e9d196' AND status = 'connected';

UPDATE profiles SET is_in_call = false, current_call_id = null WHERE id IN ('1ba6de4d-0d5c-4751-8a56-820c44603f9a', 'ab155d31-96d4-4a42-855d-b2c090ba0339');

-- Make cleanup_stale_in_call_flags MORE aggressive: 5 minutes max for connected calls
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

  -- 3. Force-end calls that have been "connected" for more than 5 MINUTES without activity
  -- (was 2 hours - now 5 minutes for faster recovery from stuck calls)
  UPDATE private_calls
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected'
    AND started_at < now() - INTERVAL '5 minutes'
    AND (ended_at IS NULL);

  -- 4. Force-end calls that have been "ringing" for more than 2 minutes
  UPDATE private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status IN ('ringing', 'pending')
    AND started_at < now() - INTERVAL '2 minutes'
    AND (ended_at IS NULL);

  -- 5. Reset is_in_call for users where is_in_call=true but current_call_id is NULL
  UPDATE profiles
  SET is_in_call = false, updated_at = now()
  WHERE is_in_call = true AND current_call_id IS NULL;

  -- 6. FINAL SWEEP: After ending stale calls above, re-check all is_in_call users
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc
  WHERE p.current_call_id = pc.id
    AND p.is_in_call = true
    AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');
END;
$$;