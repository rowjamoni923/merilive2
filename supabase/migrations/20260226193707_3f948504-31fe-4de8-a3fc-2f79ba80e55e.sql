
-- Create a function to clean up stale is_in_call flags
-- This catches cases where end_private_call RPC failed or wasn't called
CREATE OR REPLACE FUNCTION public.cleanup_stale_in_call_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset is_in_call for users whose current_call_id points to an ended/missed call
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE p.is_in_call = true
    AND p.current_call_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM private_calls pc 
      WHERE pc.id = p.current_call_id 
      AND pc.status IN ('ended', 'missed', 'declined', 'cancelled')
    );

  -- Reset is_in_call for users whose current_call_id doesn't exist at all
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE p.is_in_call = true
    AND p.current_call_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM private_calls pc WHERE pc.id = p.current_call_id
    );

  -- Reset is_in_call for users who have been in call for more than 2 hours (safety limit)
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE p.is_in_call = true
    AND p.current_call_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM private_calls pc 
      WHERE pc.id = p.current_call_id 
      AND pc.status = 'connected'
      AND pc.connected_at < (now() - INTERVAL '2 hours')
    );

  -- Reset is_in_call for users with null current_call_id but is_in_call = true
  UPDATE profiles p
  SET is_in_call = false, updated_at = now()
  WHERE p.is_in_call = true
    AND p.current_call_id IS NULL;
END;
$$;
