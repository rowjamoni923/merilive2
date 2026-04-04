
-- 1) Fix currently stuck calls and users
UPDATE private_calls 
SET status = 'missed', ended_at = now(), end_reason = 'timeout'
WHERE status = 'ringing' AND created_at < now() - interval '1 minute';

UPDATE private_calls 
SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
WHERE status = 'connected' AND created_at < now() - interval '2 hours';

-- Reset is_in_call for users who have NO active calls
UPDATE profiles 
SET is_in_call = false, current_call_id = NULL
WHERE is_in_call = true 
AND id NOT IN (
  SELECT caller_id FROM private_calls WHERE status IN ('ringing', 'connected')
  UNION
  SELECT host_id FROM private_calls WHERE status IN ('ringing', 'connected')
);

-- 2) Enhance cleanup_stale_online_users to also clean stuck calls
CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- === STALE CALL CLEANUP ===
  -- Auto-miss ringing calls older than 60 seconds
  UPDATE private_calls 
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE status = 'ringing' AND created_at < now() - interval '60 seconds';

  -- Auto-end connected calls older than 2 hours (safety net)
  UPDATE private_calls 
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected' AND started_at < now() - interval '2 hours';

  -- Reset is_in_call for users with no active calls
  UPDATE profiles 
  SET is_in_call = false, current_call_id = NULL
  WHERE is_in_call = true 
  AND id NOT IN (
    SELECT caller_id FROM private_calls WHERE status IN ('ringing', 'connected')
    UNION
    SELECT host_id FROM private_calls WHERE status IN ('ringing', 'connected')
  );

  -- === STALE ONLINE CLEANUP ===
  -- Regular users: offline after 2 minutes of no heartbeat
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = false
    AND last_seen_at < now() - interval '2 minutes';

  -- Hosts: offline after 1 hour of no heartbeat
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = true
    AND last_seen_at < now() - interval '1 hour';
END;
$$;
