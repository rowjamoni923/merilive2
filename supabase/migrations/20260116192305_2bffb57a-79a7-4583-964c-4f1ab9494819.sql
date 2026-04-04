-- Create shop_items table for Level Shop system
CREATE TABLE IF NOT EXISTS public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'frame', -- 'frame', 'entrance', 'bubble', 'vehicle', 'badge', 'effect'
  item_type TEXT NOT NULL DEFAULT 'cosmetic',
  preview_url TEXT, -- Image/GIF preview
  animation_url TEXT, -- Lottie/GIF animation
  price_diamonds INTEGER NOT NULL DEFAULT 100,
  duration_days INTEGER DEFAULT NULL, -- NULL = permanent
  min_level INTEGER DEFAULT 0,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  rarity TEXT DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary', 'mythic'
  display_order INTEGER DEFAULT 0,
  total_sold INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_purchases table to track what users have bought
CREATE TABLE IF NOT EXISTS public.user_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NULL = never expires
  is_active BOOLEAN DEFAULT true,
  is_equipped BOOLEAN DEFAULT false,
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Enable RLS
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

-- Shop items: anyone can view active items
CREATE POLICY "Anyone can view shop items" ON public.shop_items
FOR SELECT USING (is_active = true);

-- Admins can manage shop items
CREATE POLICY "Admins can manage shop items" ON public.shop_items
FOR ALL USING (public.is_admin(auth.uid()));

-- Users can view their own purchases
CREATE POLICY "Users can view own purchases" ON public.user_purchases
FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own purchases
CREATE POLICY "Users can create purchases" ON public.user_purchases
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own purchases (equip/unequip)
CREATE POLICY "Users can update own purchases" ON public.user_purchases
FOR UPDATE USING (auth.uid() = user_id);

-- Add equipped_item columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS equipped_frame_id UUID REFERENCES public.shop_items(id),
ADD COLUMN IF NOT EXISTS equipped_entrance_id UUID REFERENCES public.shop_items(id),
ADD COLUMN IF NOT EXISTS equipped_bubble_id UUID REFERENCES public.shop_items(id),
ADD COLUMN IF NOT EXISTS equipped_vehicle_id UUID REFERENCES public.shop_items(id);

-- Insert sample shop items for each category
INSERT INTO public.shop_items (name, description, category, preview_url, price_diamonds, duration_days, min_level, rarity, is_featured, display_order) VALUES
-- Avatar Frames
('Golden Crown Frame', 'Majestic golden crown border for royalty', 'frame', 'https://i.imgur.com/1NxMHDk.gif', 500, NULL, 5, 'rare', true, 1),
('Diamond Sparkle', 'Sparkling diamond animation frame', 'frame', 'https://i.imgur.com/8PjqLbI.gif', 1000, NULL, 8, 'epic', true, 2),
('Fire Ring', 'Burning flames around your avatar', 'frame', 'https://i.imgur.com/YH5aLsU.gif', 2000, NULL, 10, 'legendary', false, 3),
('Rainbow Aura', 'Magical rainbow glowing effect', 'frame', 'https://i.imgur.com/qEZt6Rq.gif', 300, 30, 3, 'common', false, 4),
('Neon Pulse', 'Cyberpunk neon border', 'frame', 'https://i.imgur.com/1NxMHDk.gif', 800, NULL, 7, 'rare', false, 5),

-- Entrance Effects
('Royal Entrance', 'Grand royal carpet entrance', 'entrance', 'https://i.imgur.com/8PjqLbI.gif', 1500, NULL, 10, 'epic', true, 1),
('Lightning Strike', 'Dramatic lightning entrance', 'entrance', 'https://i.imgur.com/YH5aLsU.gif', 2500, NULL, 15, 'legendary', false, 2),
('Flower Shower', 'Beautiful flower petals entrance', 'entrance', 'https://i.imgur.com/qEZt6Rq.gif', 500, 30, 5, 'common', false, 3),
('Galaxy Portal', 'Space portal entrance effect', 'entrance', 'https://i.imgur.com/1NxMHDk.gif', 5000, NULL, 20, 'mythic', true, 4),

-- Chat Bubbles
('Crystal Bubble', 'Elegant crystal chat bubble', 'bubble', 'https://i.imgur.com/8PjqLbI.gif', 200, NULL, 3, 'common', false, 1),
('Fire Bubble', 'Flaming chat bubble', 'bubble', 'https://i.imgur.com/YH5aLsU.gif', 600, NULL, 8, 'rare', false, 2),
('VIP Gold Bubble', 'Luxury gold VIP chat style', 'bubble', 'https://i.imgur.com/qEZt6Rq.gif', 1200, NULL, 12, 'epic', true, 3),

-- Vehicles (Entrance rides)
('Sports Car', 'Speed into the room with style', 'vehicle', 'https://i.imgur.com/1NxMHDk.gif', 3000, NULL, 15, 'epic', false, 1),
('Private Jet', 'Arrive by luxury jet', 'vehicle', 'https://i.imgur.com/8PjqLbI.gif', 8000, NULL, 25, 'legendary', true, 2),
('Dragon Mount', 'Ride a majestic dragon', 'vehicle', 'https://i.imgur.com/YH5aLsU.gif', 15000, NULL, 30, 'mythic', true, 3),
('UFO', 'Alien spacecraft entrance', 'vehicle', 'https://i.imgur.com/qEZt6Rq.gif', 10000, NULL, 28, 'legendary', false, 4),

-- Special Badges
('VIP Badge', 'Exclusive VIP member badge', 'badge', 'https://i.imgur.com/1NxMHDk.gif', 5000, 30, 10, 'epic', true, 1),
('Whale Badge', 'Top spender recognition', 'badge', 'https://i.imgur.com/8PjqLbI.gif', 20000, NULL, 20, 'mythic', false, 2),
('Streamer Badge', 'Verified streamer badge', 'badge', 'https://i.imgur.com/YH5aLsU.gif', 1000, NULL, 5, 'rare', false, 3);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_shop_items_category ON public.shop_items(category);
CREATE INDEX IF NOT EXISTS idx_shop_items_featured ON public.shop_items(is_featured);
CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON public.user_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_user_purchases_active ON public.user_purchases(is_active);