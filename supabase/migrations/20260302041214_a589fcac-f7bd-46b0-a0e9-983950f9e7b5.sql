
-- The profiles cleanup and trigger update already applied in the previous partial migration.
-- Now handle followers and update the enforce_permanent_ban trigger to use correct table name.

-- Delete followers involving banned users
DELETE FROM followers WHERE follower_id IN (SELECT id FROM profiles WHERE is_blocked = true)
  OR following_id IN (SELECT id FROM profiles WHERE is_blocked = true);

-- Update enforce_permanent_ban to use correct table name
CREATE OR REPLACE FUNCTION public.enforce_permanent_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NOT TRUE) THEN
    NEW.is_host := false;
    NEW.host_status := 'rejected';
    NEW.is_online := false;
    NEW.is_in_call := false;
    NEW.active_session_id := null;
    
    UPDATE agency_hosts SET status = 'removed', left_at = now()
    WHERE host_id = NEW.id AND status = 'active';
    
    UPDATE agencies SET is_blocked = true, is_active = false,
      blocked_at = now(), blocked_reason = 'Owner permanently banned'
    WHERE owner_id = NEW.id AND is_blocked IS NOT TRUE;
    
    DELETE FROM followers WHERE follower_id = NEW.id OR following_id = NEW.id;
    
    UPDATE live_streams SET status = 'ended', ended_at = now()
    WHERE host_id = NEW.id AND status = 'live';
  END IF;
  RETURN NEW;
END;
$$;
