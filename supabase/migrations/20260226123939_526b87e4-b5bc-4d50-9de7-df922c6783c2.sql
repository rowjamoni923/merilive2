
-- Fix cleanup_stale_online_users to also clean up stale HOSTS
-- Hosts should go offline if heartbeat stops for 5 minutes (longer grace period than regular users)
CREATE OR REPLACE FUNCTION cleanup_stale_online_users()
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

  -- Mark HOSTS as offline if last_seen > 5 minutes (longer grace for background/network issues)
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = true
    AND last_seen_at < NOW() - INTERVAL '5 minutes';
  
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
