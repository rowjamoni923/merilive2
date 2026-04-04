-- Add a proper entrance animation privilege (corrected column names)
INSERT INTO level_privileges (
  id,
  name,
  description,
  privilege_type,
  animation_url,
  unlock_level,
  is_active
) VALUES (
  'e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
  'Golden Entrance',
  'A golden VIP entrance animation',
  'entrance',
  'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/animations/entry-bars/1769188147113_trf42.svga',
  1,
  true
)
ON CONFLICT (id) DO UPDATE SET
  animation_url = EXCLUDED.animation_url,
  is_active = true;

-- Equip this entrance for Bd Admin user
UPDATE profiles 
SET equipped_entrance_id = 'e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c'
WHERE id = 'ab155d31-96d4-4a42-855d-b2c090ba0339';

-- Also equip an entry name bar
UPDATE profiles 
SET equipped_entry_name_bar_id = '6cc40d51-6074-4a6f-b361-1844df2d7be2'
WHERE id = 'ab155d31-96d4-4a42-855d-b2c090ba0339';