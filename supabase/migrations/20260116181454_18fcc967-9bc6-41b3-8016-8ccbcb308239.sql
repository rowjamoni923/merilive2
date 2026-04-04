-- Clean up stale party room participants (joined more than 24 hours ago and not left)
UPDATE party_room_participants 
SET left_at = NOW() 
WHERE left_at IS NULL 
AND joined_at < NOW() - INTERVAL '24 hours';

-- Reset current_participants count for all rooms based on actual active participants
UPDATE party_rooms pr
SET current_participants = (
  SELECT COUNT(*)::INTEGER 
  FROM party_room_participants prp 
  WHERE prp.room_id = pr.id 
  AND prp.left_at IS NULL
  AND prp.joined_at > NOW() - INTERVAL '24 hours'
);

-- Deactivate rooms with 0 participants that are older than 6 hours
UPDATE party_rooms 
SET is_active = false 
WHERE current_participants = 0 
AND created_at < NOW() - INTERVAL '6 hours';