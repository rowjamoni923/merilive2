-- Update min_level 1 frames to min_level 0 so level 0 users can see them
UPDATE avatar_frames 
SET min_level = 0, updated_at = now()
WHERE min_level = 1;

-- Also update the lowest host frame to min_level 0
UPDATE avatar_frames 
SET min_level = 0, updated_at = now()
WHERE id = (
  SELECT id FROM avatar_frames 
  WHERE target_type = 'host' AND is_active = true 
  ORDER BY min_level ASC 
  LIMIT 1
);