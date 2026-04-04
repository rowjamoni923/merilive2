-- Add new privilege_type options to level_privileges
-- These will support: chat_bubble, vip_medal, noble_card, vehicle_entrance

-- First, let's add the new categories to the level_privileges check if they don't exist
-- The level_privileges table already supports any privilege_type string

-- Create storage buckets for new animation types
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('chat-bubbles', 'chat-bubbles', true),
  ('vip-medals', 'vip-medals', true),
  ('noble-cards', 'noble-cards', true),
  ('vehicle-entrances', 'vehicle-entrances', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for new buckets
CREATE POLICY "Public read chat-bubbles" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-bubbles');

CREATE POLICY "Admin upload chat-bubbles" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-bubbles');

CREATE POLICY "Admin update chat-bubbles" ON storage.objects
  FOR UPDATE USING (bucket_id = 'chat-bubbles');

CREATE POLICY "Admin delete chat-bubbles" ON storage.objects
  FOR DELETE USING (bucket_id = 'chat-bubbles');

CREATE POLICY "Public read vip-medals" ON storage.objects
  FOR SELECT USING (bucket_id = 'vip-medals');

CREATE POLICY "Admin upload vip-medals" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'vip-medals');

CREATE POLICY "Admin update vip-medals" ON storage.objects
  FOR UPDATE USING (bucket_id = 'vip-medals');

CREATE POLICY "Admin delete vip-medals" ON storage.objects
  FOR DELETE USING (bucket_id = 'vip-medals');

CREATE POLICY "Public read noble-cards" ON storage.objects
  FOR SELECT USING (bucket_id = 'noble-cards');

CREATE POLICY "Admin upload noble-cards" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'noble-cards');

CREATE POLICY "Admin update noble-cards" ON storage.objects
  FOR UPDATE USING (bucket_id = 'noble-cards');

CREATE POLICY "Admin delete noble-cards" ON storage.objects
  FOR DELETE USING (bucket_id = 'noble-cards');

CREATE POLICY "Public read vehicle-entrances" ON storage.objects
  FOR SELECT USING (bucket_id = 'vehicle-entrances');

CREATE POLICY "Admin upload vehicle-entrances" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'vehicle-entrances');

CREATE POLICY "Admin update vehicle-entrances" ON storage.objects
  FOR UPDATE USING (bucket_id = 'vehicle-entrances');

CREATE POLICY "Admin delete vehicle-entrances" ON storage.objects
  FOR DELETE USING (bucket_id = 'vehicle-entrances');

-- Add equipped columns to profiles for new categories
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equipped_bubble_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equipped_medal_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equipped_noble_card_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equipped_vehicle_id uuid;