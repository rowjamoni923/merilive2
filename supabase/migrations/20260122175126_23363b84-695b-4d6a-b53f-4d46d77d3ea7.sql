-- First, end all stuck calls that have been "connected" for more than 30 minutes (likely abandoned)
UPDATE private_calls 
SET status = 'ended', ended_at = now()
WHERE status IN ('connected', 'pending', 'ringing')
AND started_at < now() - interval '30 minutes';

-- Reset is_in_call for all users who are NOT in any active call
UPDATE profiles 
SET is_in_call = false 
WHERE is_in_call = true 
AND id NOT IN (
  SELECT caller_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing')
  UNION
  SELECT host_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing')
);

-- Create or replace a function to automatically cleanup stuck calls (runs periodically)
CREATE OR REPLACE FUNCTION public.cleanup_stuck_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- End calls that have been stuck for more than 10 minutes
  UPDATE private_calls 
  SET status = 'ended', ended_at = now()
  WHERE status IN ('connected', 'pending', 'ringing')
  AND started_at < now() - interval '10 minutes';
  
  -- Reset is_in_call for users not in active calls
  UPDATE profiles 
  SET is_in_call = false 
  WHERE is_in_call = true 
  AND id NOT IN (
    SELECT caller_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing')
    UNION
    SELECT host_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing')
  );
END;
$$;