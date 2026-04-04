-- Create avatar_frames table for profile frame system
CREATE TABLE IF NOT EXISTS public.avatar_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  frame_url TEXT NOT NULL,
  animation_type TEXT DEFAULT 'static',
  min_level INTEGER DEFAULT 1,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.avatar_frames ENABLE ROW LEVEL SECURITY;

-- Allow public read access to frames
CREATE POLICY "Anyone can view frames" ON public.avatar_frames
FOR SELECT USING (is_active = true);

-- Allow admins to manage frames
CREATE POLICY "Admins can manage frames" ON public.avatar_frames
FOR ALL USING (public.is_admin(auth.uid()));

-- Add frame_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS frame_id UUID REFERENCES public.avatar_frames(id);

-- Insert 100 premium 3D animated frames for different levels
INSERT INTO public.avatar_frames (name, frame_url, animation_type, min_level, display_order) VALUES
-- Level 1 Frames (Basic)
('Golden Ring', 'https://i.imgur.com/1NxMHDk.gif', 'glow', 1, 1),
('Blue Aura', 'https://i.imgur.com/8PjqLbI.gif', 'pulse', 1, 2),
('Pink Hearts', 'https://i.imgur.com/YH5aLsU.gif', 'float', 1, 3),
('Green Nature', 'https://i.imgur.com/qEZt6Rq.gif', 'rotate', 1, 4),
('Purple Magic', 'https://i.imgur.com/Ks5DnHH.gif', 'sparkle', 1, 5),

-- Level 5 Frames
('Fire Ring', 'https://i.imgur.com/FpDxaLs.gif', 'flame', 5, 6),
('Ice Crystal', 'https://i.imgur.com/dQE5kzP.gif', 'freeze', 5, 7),
('Rainbow Glow', 'https://i.imgur.com/7xQP9mZ.gif', 'rainbow', 5, 8),
('Star Burst', 'https://i.imgur.com/K1nTvXc.gif', 'burst', 5, 9),
('Electric', 'https://i.imgur.com/wXr5bPq.gif', 'electric', 5, 10),

-- Level 10 Frames
('Diamond Crown', 'https://i.imgur.com/pLm2KxQ.gif', 'shine', 10, 11),
('Royal Purple', 'https://i.imgur.com/xZR4pKv.gif', 'royal', 10, 12),
('Flame Phoenix', 'https://i.imgur.com/mNq7TyL.gif', 'phoenix', 10, 13),
('Ocean Wave', 'https://i.imgur.com/Bc9qRpK.gif', 'wave', 10, 14),
('Cosmic Stars', 'https://i.imgur.com/HvQ3xJt.gif', 'cosmic', 10, 15),

-- Level 15 Frames
('Neon Glow', 'https://i.imgur.com/WpR6nYm.gif', 'neon', 15, 16),
('Galaxy Spiral', 'https://i.imgur.com/pKx2TmQ.gif', 'spiral', 15, 17),
('Thunder Strike', 'https://i.imgur.com/Lv4xNqR.gif', 'thunder', 15, 18),
('Cherry Blossom', 'https://i.imgur.com/nQp8TvL.gif', 'blossom', 15, 19),
('Aurora Borealis', 'https://i.imgur.com/Kx7pMnQ.gif', 'aurora', 15, 20),

-- Level 20 Frames (Premium)
('Dragon Fire', 'https://i.imgur.com/xNr6pQm.gif', 'dragon', 20, 21),
('Angel Wings', 'https://i.imgur.com/Pm9qTvK.gif', 'wings', 20, 22),
('Dark Shadow', 'https://i.imgur.com/Lk8nQpR.gif', 'shadow', 20, 23),
('Gold Luxury', 'https://i.imgur.com/Tn4xMqK.gif', 'luxury', 20, 24),
('Crystal Heart', 'https://i.imgur.com/Rp6qNvM.gif', 'crystal', 20, 25),

-- Level 25 Frames
('Platinum Elite', 'https://i.imgur.com/Vn3pKxQ.gif', 'platinum', 25, 26),
('Emerald Fortune', 'https://i.imgur.com/Wp8nTqL.gif', 'emerald', 25, 27),
('Ruby Passion', 'https://i.imgur.com/Xp2mQvK.gif', 'ruby', 25, 28),
('Sapphire Dream', 'https://i.imgur.com/Yp5nRqM.gif', 'sapphire', 25, 29),
('Amethyst Mystery', 'https://i.imgur.com/Zp7pSvN.gif', 'amethyst', 25, 30),

-- Level 30 Frames (VIP)
('VIP Crown', 'https://i.imgur.com/Ap9qTwK.gif', 'crown', 30, 31),
('Legendary Flame', 'https://i.imgur.com/Bp1nUxL.gif', 'legendary', 30, 32),
('Mystic Portal', 'https://i.imgur.com/Cp3pVyM.gif', 'portal', 30, 33),
('Divine Light', 'https://i.imgur.com/Dp5qWzN.gif', 'divine', 30, 34),
('Celestial Ring', 'https://i.imgur.com/Ep7rXaO.gif', 'celestial', 30, 35),

-- Level 35 Frames
('Inferno Blaze', 'https://i.imgur.com/Fp9sYbP.gif', 'inferno', 35, 36),
('Frost Queen', 'https://i.imgur.com/Gp1tZcQ.gif', 'frost', 35, 37),
('Thunder God', 'https://i.imgur.com/Hp3uAdR.gif', 'god', 35, 38),
('Nature Spirit', 'https://i.imgur.com/Ip5vBeS.gif', 'spirit', 35, 39),
('Dark Knight', 'https://i.imgur.com/Jp7wCfT.gif', 'knight', 35, 40),

-- Level 40 Frames (Super VIP)
('Super Nova', 'https://i.imgur.com/Kp9xDgU.gif', 'supernova', 40, 41),
('Black Hole', 'https://i.imgur.com/Lp1yEhV.gif', 'blackhole', 40, 42),
('Quantum Flash', 'https://i.imgur.com/Mp3zFiW.gif', 'quantum', 40, 43),
('Phoenix Rebirth', 'https://i.imgur.com/Np5aGjX.gif', 'rebirth', 40, 44),
('Time Warp', 'https://i.imgur.com/Op7bHkY.gif', 'timewarp', 40, 45),

-- Level 45 Frames
('Emperor Gold', 'https://i.imgur.com/Pp9cIlZ.gif', 'emperor', 45, 46),
('Empress Rose', 'https://i.imgur.com/Qp1dJmA.gif', 'empress', 45, 47),
('Galaxy Master', 'https://i.imgur.com/Rp3eKnB.gif', 'master', 45, 48),
('Eternal Flame', 'https://i.imgur.com/Sp5fLoC.gif', 'eternal', 45, 49),
('Ultimate Power', 'https://i.imgur.com/Tp7gMpD.gif', 'ultimate', 45, 50),

-- Level 50 Frames (Max Level - Legendary)
('Legendary Dragon', 'https://i.imgur.com/Up9hNqE.gif', 'legendarydragon', 50, 51),
('Mythic Phoenix', 'https://i.imgur.com/Vp1iOrF.gif', 'mythic', 50, 52),
('Supreme King', 'https://i.imgur.com/Wp3jPsG.gif', 'supreme', 50, 53),
('Divine Goddess', 'https://i.imgur.com/Xp5kQtH.gif', 'goddess', 50, 54),
('Infinite Cosmos', 'https://i.imgur.com/Yp7lRuI.gif', 'infinite', 50, 55),

-- Additional Premium Frames
('Sakura Dreams', 'https://i.imgur.com/Zp9mSvJ.gif', 'sakura', 8, 56),
('Cyber Neon', 'https://i.imgur.com/Aq1nTwK.gif', 'cyber', 12, 57),
('Vintage Gold', 'https://i.imgur.com/Bq3oUxL.gif', 'vintage', 3, 58),
('Modern Silver', 'https://i.imgur.com/Cq5pVyM.gif', 'modern', 2, 59),
('Classic Bronze', 'https://i.imgur.com/Dq7qWzN.gif', 'classic', 1, 60),

-- More Animated Frames
('Heartbeat', 'https://i.imgur.com/Eq9rXaO.gif', 'heartbeat', 6, 61),
('Starlight', 'https://i.imgur.com/Fq1sYbP.gif', 'starlight', 7, 62),
('Moonshine', 'https://i.imgur.com/Gq3tZcQ.gif', 'moonshine', 9, 63),
('Sunshine', 'https://i.imgur.com/Hq5uAdR.gif', 'sunshine', 4, 64),
('Rainbow Magic', 'https://i.imgur.com/Iq7vBeS.gif', 'magicbow', 11, 65),

('Cloud Nine', 'https://i.imgur.com/Jq9wCfT.gif', 'cloud', 13, 66),
('Desert Storm', 'https://i.imgur.com/Kq1xDgU.gif', 'desert', 14, 67),
('Ocean Deep', 'https://i.imgur.com/Lq3yEhV.gif', 'ocean', 16, 68),
('Mountain Peak', 'https://i.imgur.com/Mq5zFiW.gif', 'mountain', 17, 69),
('Forest Magic', 'https://i.imgur.com/Nq7aGjX.gif', 'forest', 18, 70),

('Candy Pop', 'https://i.imgur.com/Oq9bHkY.gif', 'candy', 19, 71),
('Bubble Fun', 'https://i.imgur.com/Pq1cIlZ.gif', 'bubble', 21, 72),
('Glitter Gold', 'https://i.imgur.com/Qq3dJmA.gif', 'glitter', 22, 73),
('Shimmer Silver', 'https://i.imgur.com/Rq5eKnB.gif', 'shimmer', 23, 74),
('Sparkle Diamond', 'https://i.imgur.com/Sq7fLoC.gif', 'diamond', 24, 75),

('Love Hearts', 'https://i.imgur.com/Tq9gMpD.gif', 'love', 26, 76),
('Party Confetti', 'https://i.imgur.com/Uq1hNqE.gif', 'party', 27, 77),
('Music Notes', 'https://i.imgur.com/Vq3iOrF.gif', 'music', 28, 78),
('Gaming Fire', 'https://i.imgur.com/Wq5jPsG.gif', 'gaming', 29, 79),
('Sports Star', 'https://i.imgur.com/Xq7kQtH.gif', 'sports', 31, 80),

('Tech Glow', 'https://i.imgur.com/Yq9lRuI.gif', 'tech', 32, 81),
('Art Palette', 'https://i.imgur.com/Zq1mSvJ.gif', 'art', 33, 82),
('Fashion Glam', 'https://i.imgur.com/Ar3nTwK.gif', 'fashion', 34, 83),
('Food Delight', 'https://i.imgur.com/Br5oUxL.gif', 'food', 36, 84),
('Travel World', 'https://i.imgur.com/Cr7pVyM.gif', 'travel', 37, 85),

('Anime Star', 'https://i.imgur.com/Dr9qWzN.gif', 'anime', 38, 86),
('K-Pop Glow', 'https://i.imgur.com/Er1rXaO.gif', 'kpop', 39, 87),
('Bollywood', 'https://i.imgur.com/Fr3sYbP.gif', 'bollywood', 41, 88),
('Hollywood', 'https://i.imgur.com/Gr5tZcQ.gif', 'hollywood', 42, 89),
('Superhero', 'https://i.imgur.com/Hr7uAdR.gif', 'superhero', 43, 90),

('Fantasy Dragon', 'https://i.imgur.com/Ir9vBeS.gif', 'fantasydragon', 44, 91),
('Unicorn Magic', 'https://i.imgur.com/Jr1wCfT.gif', 'unicorn', 46, 92),
('Fairy Dust', 'https://i.imgur.com/Kr3xDgU.gif', 'fairy', 47, 93),
('Mermaid Sea', 'https://i.imgur.com/Lr5yEhV.gif', 'mermaid', 48, 94),
('Wizard Magic', 'https://i.imgur.com/Mr7zFiW.gif', 'wizard', 49, 95),

-- Top 5 Ultimate Frames
('Supreme VIP', 'https://i.imgur.com/Nr9aGjX.gif', 'supremevip', 50, 96),
('Royal Majesty', 'https://i.imgur.com/Or1bHkY.gif', 'majesty', 50, 97),
('Ultimate Legend', 'https://i.imgur.com/Pr3cIlZ.gif', 'legend', 50, 98),
('Godlike Power', 'https://i.imgur.com/Qr5dJmA.gif', 'godlike', 50, 99),
('Cosmic Emperor', 'https://i.imgur.com/Rr7eKnB.gif', 'cosmicemperor', 50, 100)

ON CONFLICT DO NOTHING;