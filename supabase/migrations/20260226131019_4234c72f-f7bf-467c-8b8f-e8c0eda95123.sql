
-- Fix stuck call for user 0649830765 (sumaiya)
UPDATE private_calls 
SET status = 'ended', ended_at = now() 
WHERE id = '2243aab1-78fd-43f2-8284-7b8bcb268f48' AND status = 'ringing';

-- Reset is_in_call flag
UPDATE profiles 
SET is_in_call = false 
WHERE id = 'e4b8eff0-314b-44f0-a063-1400addff921';

-- Also fix any other stuck calls globally (ringing/connected for more than 2 hours)
UPDATE private_calls 
SET status = 'ended', ended_at = now() 
WHERE status IN ('ringing', 'connected') 
AND created_at < now() - interval '2 hours';

-- Reset is_in_call for users whose calls are all ended
UPDATE profiles 
SET is_in_call = false 
WHERE is_in_call = true 
AND id NOT IN (
  SELECT DISTINCT host_id FROM private_calls WHERE status IN ('ringing', 'connected')
  UNION
  SELECT DISTINCT caller_id FROM private_calls WHERE status IN ('ringing', 'connected')
);
