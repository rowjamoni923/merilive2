-- Add a default frame for all levels (min_level = 1) so everyone can have a frame
INSERT INTO avatar_frames (name, frame_url, frame_type, min_level, target_type, is_active, display_order, description)
SELECT 
  'Default Glow Frame',
  'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/frames/frame_1769188561925_zaju9.svga',
  'svga',
  1,
  'both',
  true,
  1,
  'Default animated frame for all users'
WHERE NOT EXISTS (
  SELECT 1 FROM avatar_frames WHERE min_level <= 1 AND is_active = true
);

-- Also add one for level 5
INSERT INTO avatar_frames (name, frame_url, frame_type, min_level, target_type, is_active, display_order, description)
SELECT 
  'Bronze Frame',
  'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/frames/frame_1769187577803_y0lj7f.svga',
  'svga',
  5,
  'both',
  true,
  2,
  'Bronze animated frame for level 5+ users'
WHERE NOT EXISTS (
  SELECT 1 FROM avatar_frames WHERE min_level = 5 AND is_active = true
);