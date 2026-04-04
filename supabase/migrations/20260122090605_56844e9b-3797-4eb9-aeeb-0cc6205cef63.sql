-- Create a function to clean up stale party room participants
-- and mark rooms as inactive when all participants leave
CREATE OR REPLACE FUNCTION cleanup_stale_party_participants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark participants who joined more than 2 hours ago and haven't left as "left"
  UPDATE party_room_participants
  SET left_at = NOW()
  WHERE left_at IS NULL
    AND joined_at < NOW() - INTERVAL '2 hours';
    
  -- Mark rooms as inactive if they have no active participants
  UPDATE party_rooms pr
  SET is_active = false
  WHERE pr.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM party_room_participants prp
      WHERE prp.room_id = pr.id
        AND prp.left_at IS NULL
        AND prp.joined_at > NOW() - INTERVAL '2 hours'
    );
END;
$$;

-- Create a trigger to clean up when a participant leaves
CREATE OR REPLACE FUNCTION check_room_active_on_participant_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count INTEGER;
BEGIN
  -- Count remaining active participants in the room
  SELECT COUNT(*) INTO active_count
  FROM party_room_participants
  WHERE room_id = NEW.room_id
    AND left_at IS NULL;
    
  -- If no active participants, mark room as inactive
  IF active_count = 0 THEN
    UPDATE party_rooms
    SET is_active = false
    WHERE id = NEW.room_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_check_room_active ON party_room_participants;

-- Create trigger that fires when a participant leaves (left_at is updated from NULL)
CREATE TRIGGER trigger_check_room_active
AFTER UPDATE OF left_at ON party_room_participants
FOR EACH ROW
WHEN (OLD.left_at IS NULL AND NEW.left_at IS NOT NULL)
EXECUTE FUNCTION check_room_active_on_participant_leave();

-- Clean up existing stale data now
SELECT cleanup_stale_party_participants();