-- ============================================
-- PRESENCE CLEANUP FUNCTION
-- Automatically marks users offline if they haven't sent a heartbeat in 2 minutes
-- ============================================

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
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND (
      last_seen_at < NOW() - INTERVAL '2 minutes'
      OR is_blocked = true
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count > 0 THEN
    RAISE NOTICE 'Cleaned up % stale online users', updated_count;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.cleanup_stale_online_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_online_users() TO service_role;

-- ============================================
-- RUN IMMEDIATE CLEANUP
-- Clean up all current stale online statuses
-- ============================================
UPDATE profiles
SET is_online = false
WHERE is_online = true
  AND (
    last_seen_at < NOW() - INTERVAL '2 minutes'
    OR is_blocked = true
  );

-- ============================================
-- INDEX for better performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_online_status 
ON profiles(is_online, last_seen_at) 
WHERE is_online = true;