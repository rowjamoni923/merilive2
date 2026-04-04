-- Fix orphaned equipped_entrance_id values
-- These IDs exist in profiles but the referenced items no longer exist in any animation table

-- Clear equipped_entrance_id where the ID doesn't exist in any valid animation table
UPDATE profiles 
SET equipped_entrance_id = NULL 
WHERE equipped_entrance_id IS NOT NULL 
AND equipped_entrance_id NOT IN (
  SELECT id FROM entry_banners WHERE animation_url IS NOT NULL
  UNION
  SELECT id FROM level_privileges WHERE animation_url IS NOT NULL AND privilege_type IN ('entrance', 'entrance_effect', 'entry_bar')
  UNION
  SELECT id FROM shop_items WHERE (animation_url IS NOT NULL OR animation_file_url IS NOT NULL)
  UNION
  SELECT id FROM vip_tiers WHERE entry_animation_url IS NOT NULL
  UNION
  SELECT id FROM entry_name_bars WHERE animation_url IS NOT NULL
);

-- Clear equipped_entry_name_bar_id where the ID doesn't exist
UPDATE profiles 
SET equipped_entry_name_bar_id = NULL 
WHERE equipped_entry_name_bar_id IS NOT NULL 
AND equipped_entry_name_bar_id NOT IN (
  SELECT id FROM entry_name_bars WHERE animation_url IS NOT NULL
  UNION
  SELECT id FROM level_privileges WHERE animation_url IS NOT NULL AND privilege_type = 'entry_bar'
  UNION
  SELECT id FROM shop_items WHERE (animation_url IS NOT NULL OR animation_file_url IS NOT NULL) AND category = 'entry_bar'
  UNION
  SELECT id FROM entry_banners WHERE animation_url IS NOT NULL
);

-- Clear equipped_vehicle_id where the ID doesn't exist  
UPDATE profiles 
SET equipped_vehicle_id = NULL 
WHERE equipped_vehicle_id IS NOT NULL 
AND equipped_vehicle_id NOT IN (
  SELECT id FROM shop_items WHERE (animation_url IS NOT NULL OR animation_file_url IS NOT NULL) AND category = 'vehicle'
);