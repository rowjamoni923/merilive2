
-- Fix reset_my_call_status to also reset the OTHER party in the call
CREATE OR REPLACE FUNCTION public.reset_my_call_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _my_call_id UUID;
  _caller_id UUID;
  _host_id UUID;
BEGIN
  -- Get current user's active call
  SELECT current_call_id INTO _my_call_id
  FROM profiles WHERE id = auth.uid();
  
  -- If user has an active call, reset BOTH parties
  IF _my_call_id IS NOT NULL THEN
    -- Get both parties from the call
    SELECT caller_id, host_id INTO _caller_id, _host_id
    FROM private_calls WHERE id = _my_call_id;
    
    -- Mark call as ended if still active
    UPDATE private_calls
    SET status = 'ended', ended_at = now(), end_reason = 'cleanup'
    WHERE id = _my_call_id AND status IN ('ringing', 'connected');
    
    -- Reset BOTH caller and host
    UPDATE profiles
    SET is_in_call = false, current_call_id = NULL, updated_at = now()
    WHERE id IN (_caller_id, _host_id);
  ELSE
    -- Fallback: just reset current user
    UPDATE profiles
    SET is_in_call = false, current_call_id = NULL, updated_at = now()
    WHERE id = auth.uid() AND is_in_call = true;
  END IF;
END;
$$;
