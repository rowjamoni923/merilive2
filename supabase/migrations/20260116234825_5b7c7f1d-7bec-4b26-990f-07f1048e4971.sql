-- End all stuck connected calls that are more than 1 hour old
UPDATE private_calls 
SET status = 'ended', 
    ended_at = NOW(),
    end_reason = 'cleanup'
WHERE status = 'connected' 
AND created_at < NOW() - INTERVAL '1 hour';

-- End all stuck pending calls that are more than 5 minutes old  
UPDATE private_calls 
SET status = 'missed', 
    ended_at = NOW(),
    end_reason = 'timeout'
WHERE status = 'pending' 
AND created_at < NOW() - INTERVAL '5 minutes';

-- Now reset all is_in_call flags
UPDATE profiles 
SET is_in_call = false 
WHERE is_in_call = true;