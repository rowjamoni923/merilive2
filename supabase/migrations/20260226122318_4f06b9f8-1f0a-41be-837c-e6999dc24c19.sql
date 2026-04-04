CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Mark users as offline if:
  -- 1. They are marked online
  -- 2. Their last_seen_at is older than 2 minutes ago
  -- 3. OR they are blocked
  -- IMPORTANT: Skip hosts (is_host = true) - they stay online unless blocked
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND (
      (last_seen_at < NOW() - INTERVAL '2 minutes' AND is_host = false)
      OR is_blocked = true
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count > 0 THEN
    RAISE NOTICE 'Cleaned up % stale online users', updated_count;
  END IF;
END;
$$;