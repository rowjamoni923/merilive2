-- Activate all avatar frames that are currently inactive
UPDATE avatar_frames 
SET is_active = true, updated_at = now()
WHERE is_active = false;