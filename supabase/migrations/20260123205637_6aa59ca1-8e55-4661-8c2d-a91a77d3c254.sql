-- Reset frame_id for all users who have deactivated/broken frames
-- This ensures only active frames are shown
UPDATE profiles p
SET frame_id = NULL
WHERE p.frame_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM avatar_frames af 
  WHERE af.id = p.frame_id 
  AND af.is_active = true
  AND af.frame_url LIKE '%supabase.co/storage%'
);

-- Also reset equipped_frame_id for consistency
UPDATE profiles p
SET equipped_frame_id = NULL
WHERE p.equipped_frame_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM avatar_frames af 
  WHERE af.id = p.equipped_frame_id 
  AND af.is_active = true
  AND af.frame_url LIKE '%supabase.co/storage%'
)
AND NOT EXISTS (
  SELECT 1 FROM shop_items si 
  WHERE si.id = p.equipped_frame_id 
  AND si.is_active = true
  AND (si.animation_url LIKE '%supabase.co/storage%' OR si.animation_file_url LIKE '%supabase.co/storage%')
);

-- Reset equipped_entrance_id for broken entries
UPDATE profiles p
SET equipped_entrance_id = NULL
WHERE p.equipped_entrance_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM level_privileges lp 
  WHERE lp.id = p.equipped_entrance_id 
  AND lp.is_active = true
  AND lp.animation_url LIKE '%supabase.co/storage%'
)
AND NOT EXISTS (
  SELECT 1 FROM shop_items si 
  WHERE si.id = p.equipped_entrance_id 
  AND si.is_active = true
  AND (si.animation_url LIKE '%supabase.co/storage%' OR si.animation_file_url LIKE '%supabase.co/storage%')
);