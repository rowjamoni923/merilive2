-- Reset all stuck is_in_call flags for users not actually in active calls
UPDATE profiles 
SET is_in_call = false 
WHERE is_in_call = true 
AND id NOT IN (
  SELECT caller_id FROM private_calls WHERE status IN ('pending', 'connected')
  UNION
  SELECT host_id FROM private_calls WHERE status IN ('pending', 'connected')
);

-- Create a function to auto-cleanup stuck calls and is_in_call flags
CREATE OR REPLACE FUNCTION cleanup_stuck_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- End any calls that have been pending for more than 2 minutes (probably missed)
  UPDATE private_calls 
  SET status = 'missed', 
      ended_at = NOW(),
      end_reason = 'timeout'
  WHERE status = 'pending' 
  AND created_at < NOW() - INTERVAL '2 minutes';
  
  -- End any calls that have been connected but no activity for 30 minutes
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = NOW(),
      end_reason = 'timeout'
  WHERE status = 'connected' 
  AND COALESCE(connected_at, created_at) < NOW() - INTERVAL '30 minutes';
  
  -- Reset is_in_call for users not actually in active calls
  UPDATE profiles 
  SET is_in_call = false 
  WHERE is_in_call = true 
  AND id NOT IN (
    SELECT caller_id FROM private_calls WHERE status IN ('pending', 'connected')
    UNION
    SELECT host_id FROM private_calls WHERE status IN ('pending', 'connected')
  );
END;
$$;