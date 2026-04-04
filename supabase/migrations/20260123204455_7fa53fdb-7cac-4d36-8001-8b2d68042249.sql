-- Deactivate all placeholder/default shop items that don't have real animation files
UPDATE shop_items 
SET is_active = false
WHERE (animation_url IS NULL OR animation_url = '')
AND (animation_file_url IS NULL OR animation_file_url = '');