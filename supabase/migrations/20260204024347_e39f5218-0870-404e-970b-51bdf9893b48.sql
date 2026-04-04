-- First clear background references in party_rooms
UPDATE party_rooms 
SET background_id = NULL;

-- Now delete all gradient-only backgrounds (no image_url)
DELETE FROM party_room_backgrounds 
WHERE image_url IS NULL OR image_url = '';