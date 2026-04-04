-- Deactivate all default/placeholder avatar_frames that don't have real animation URLs
-- Keep only frames with real uploaded files (containing supabase.co storage URLs)
UPDATE avatar_frames 
SET is_active = false
WHERE frame_url NOT LIKE '%supabase.co/storage%' 
  AND frame_url NOT LIKE '%.svga%';

-- Deactivate all default level_privileges that don't have real animation URLs
-- Keep only privileges with real uploaded SVGA/Lottie files
UPDATE level_privileges 
SET is_active = false
WHERE animation_url IS NULL 
   OR animation_url = ''
   OR (animation_url NOT LIKE '%supabase.co/storage%' AND animation_url NOT LIKE '%.svga%' AND animation_url NOT LIKE '%.json%');