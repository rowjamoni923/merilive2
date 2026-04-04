-- Add animation_file_url column for direct file uploads
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS animation_file_url text;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS file_type text DEFAULT 'image';
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS animation_type text DEFAULT 'static';

-- Update categories with more options
-- Drop and recreate the category check if it exists
ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_category_check;

-- Add extended categories for live streaming app
COMMENT ON COLUMN shop_items.category IS 'Categories: frame, entrance, bubble, vehicle, badge, effect, party_background, seat_effect, gift_effect, profile_decoration, room_theme, sticker, emoji, lucky_gift';

-- Create storage bucket for shop item uploads if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-items',
  'shop-items',
  true,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/json', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/json', 'video/mp4', 'video/webm'];

-- Create storage policies for shop-items bucket
CREATE POLICY "Anyone can view shop items" ON storage.objects
  FOR SELECT USING (bucket_id = 'shop-items');

CREATE POLICY "Admin can upload shop items" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'shop-items' 
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update shop items" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'shop-items' 
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete shop items" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'shop-items' 
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Add more sample categories
INSERT INTO shop_items (name, description, category, price_diamonds, rarity, is_active, is_featured, animation_type, file_type, display_order)
VALUES 
  -- Party Backgrounds
  ('Neon City', 'Cyberpunk neon city background', 'party_background', 500, 'epic', true, true, 'animated', 'gif', 1),
  ('Galaxy Dreams', 'Space galaxy animated background', 'party_background', 800, 'legendary', true, true, 'animated', 'gif', 2),
  ('Ocean Waves', 'Calm ocean waves background', 'party_background', 300, 'rare', true, false, 'animated', 'gif', 3),
  
  -- Seat Effects
  ('Golden Throne', 'Royal golden seat effect', 'seat_effect', 1000, 'legendary', true, true, 'animated', 'gif', 1),
  ('Fire Ring', 'Burning fire ring around seat', 'seat_effect', 600, 'epic', true, false, 'animated', 'gif', 2),
  ('Ice Crystal', 'Frozen ice crystal seat', 'seat_effect', 400, 'rare', true, false, 'animated', 'gif', 3),
  
  -- Gift Effects
  ('Confetti Burst', 'Colorful confetti explosion', 'gift_effect', 200, 'rare', true, false, 'animated', 'gif', 1),
  ('Fireworks', 'Beautiful fireworks display', 'gift_effect', 500, 'epic', true, true, 'animated', 'gif', 2),
  
  -- Profile Decorations
  ('Diamond Crown', 'Sparkling diamond crown', 'profile_decoration', 1500, 'mythic', true, true, 'animated', 'gif', 1),
  ('Angel Wings', 'Beautiful angel wings', 'profile_decoration', 800, 'legendary', true, false, 'animated', 'gif', 2),
  
  -- Room Themes
  ('Luxury Palace', 'Royal palace room theme', 'room_theme', 2000, 'mythic', true, true, 'animated', 'gif', 1),
  ('Tropical Paradise', 'Beach paradise theme', 'room_theme', 1000, 'legendary', true, false, 'animated', 'gif', 2),
  
  -- Premium Stickers
  ('Love Hearts', 'Animated love hearts', 'sticker', 100, 'common', true, false, 'animated', 'gif', 1),
  ('Celebration', 'Party celebration sticker', 'sticker', 150, 'rare', true, false, 'animated', 'gif', 2),
  
  -- Animated Emojis
  ('Dancing Star', 'Dancing star emoji', 'emoji', 50, 'common', true, false, 'animated', 'gif', 1),
  ('Flying Kiss', 'Flying kiss emoji', 'emoji', 80, 'rare', true, false, 'animated', 'gif', 2),
  
  -- Lucky Gifts
  ('Lucky Box', 'Mystery lucky box', 'lucky_gift', 300, 'epic', true, true, 'animated', 'lottie', 1),
  ('Fortune Wheel', 'Spin the fortune wheel', 'lucky_gift', 500, 'legendary', true, true, 'animated', 'lottie', 2)
ON CONFLICT DO NOTHING;