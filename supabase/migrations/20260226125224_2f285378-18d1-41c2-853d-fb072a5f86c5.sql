
-- Update cleanup function: Hosts stay online for 60 minutes after last heartbeat
-- Regular users: 2 minutes (unchanged)
CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Mark REGULAR USERS as offline if last_seen > 2 minutes
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = false
    AND last_seen_at < NOW() - INTERVAL '2 minutes';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Mark HOSTS as offline ONLY if last_seen > 60 minutes (1 hour grace period)
  -- This allows hosts to receive calls even after closing the app
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = true
    AND last_seen_at < NOW() - INTERVAL '60 minutes';
  
  updated_count := updated_count + ROW_COUNT;

  -- Always mark blocked users as offline
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_blocked = true;
  
  updated_count := updated_count + ROW_COUNT;
  
  IF updated_count > 0 THEN
    RAISE NOTICE 'Cleaned up % stale online users', updated_count;
  END IF;
END;
$$;
