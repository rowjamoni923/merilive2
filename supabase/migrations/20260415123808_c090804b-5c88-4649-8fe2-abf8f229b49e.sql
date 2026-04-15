-- Add missing columns that Level.tsx and AdminLevelPrivileges.tsx expect
ALTER TABLE level_privileges ADD COLUMN IF NOT EXISTS icon_name text DEFAULT 'Star';
ALTER TABLE level_privileges ADD COLUMN IF NOT EXISTS icon_bg_color text DEFAULT '#3B82F6';
ALTER TABLE level_privileges ADD COLUMN IF NOT EXISTS icon_color text DEFAULT '#FFFFFF';

-- Activate all existing privileges and set proper icon metadata
UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Sparkles',
  icon_bg_color = '#FEE2E2',
  icon_color = '#EF4444'
WHERE privilege_type = 'entrance' OR privilege_key = 'entrance';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Frame',
  icon_bg_color = '#FCE7F3',
  icon_color = '#EC4899'
WHERE privilege_type = 'portrait_frame';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Star',
  icon_bg_color = '#FEF3C7',
  icon_color = '#F59E0B'
WHERE privilege_type = 'privilege_sticker';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Gift',
  icon_bg_color = '#DBEAFE',
  icon_color = '#3B82F6'
WHERE privilege_type = 'privilege_gift';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Sparkles',
  icon_bg_color = '#E0E7FF',
  icon_color = '#6366F1'
WHERE privilege_type = 'entrance_effect';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Image',
  icon_bg_color = '#D1FAE5',
  icon_color = '#10B981'
WHERE privilege_type = 'party_background';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Headphones',
  icon_bg_color = '#F3E8FF',
  icon_color = '#9333EA'
WHERE privilege_type = 'customer_service';

UPDATE level_privileges SET 
  is_active = true,
  icon_name = 'Car',
  icon_bg_color = '#FFF7ED',
  icon_color = '#EA580C'
WHERE privilege_type = 'vehicle_entrance';

-- Insert entry_bar privilege if missing (admin panel expects it)
INSERT INTO level_privileges (id, privilege_type, privilege_key, name, privilege_name, description, unlock_level, level, display_order, is_active, icon_name, icon_bg_color, icon_color)
SELECT gen_random_uuid(), 'entry_bar', 'entry_bar', 'Entry Bar', 'Entry Bar', 'Show a striking bar when entering rooms.', 1, 1, 1, true, 'Sparkles', '#FEE2E2', '#EF4444'
WHERE NOT EXISTS (SELECT 1 FROM level_privileges WHERE privilege_type = 'entry_bar');

-- Insert badge privilege if missing
INSERT INTO level_privileges (id, privilege_type, privilege_key, name, privilege_name, description, unlock_level, level, display_order, is_active, icon_name, icon_bg_color, icon_color)
SELECT gen_random_uuid(), 'badge', 'badge', 'Level Badge', 'Level Badge', 'Display your level badge on profile.', 1, 1, 2, true, 'Crown', '#FEF3C7', '#F59E0B'
WHERE NOT EXISTS (SELECT 1 FROM level_privileges WHERE privilege_type = 'badge');

-- Insert medal_display privilege if missing
INSERT INTO level_privileges (id, privilege_type, privilege_key, name, privilege_name, description, unlock_level, level, display_order, is_active, icon_name, icon_bg_color, icon_color)
SELECT gen_random_uuid(), 'medal_display', 'medal_display', 'Medal Display', 'Medal Display', 'Display your earned medals.', 8, 8, 8, true, 'Crown', '#FFF7ED', '#EA580C'
WHERE NOT EXISTS (SELECT 1 FROM level_privileges WHERE privilege_type = 'medal_display');