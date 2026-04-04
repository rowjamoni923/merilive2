
-- Event Themes table for app-wide theming
CREATE TABLE public.app_event_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_key TEXT NOT NULL UNIQUE,
  theme_name TEXT NOT NULL,
  theme_icon TEXT NOT NULL DEFAULT '🎉',
  description TEXT,
  
  -- Colors (HSL values)
  primary_color TEXT NOT NULL DEFAULT '340 82% 52%',
  secondary_color TEXT NOT NULL DEFAULT '280 60% 50%',
  accent_color TEXT NOT NULL DEFAULT '45 93% 47%',
  nav_bg_color TEXT NOT NULL DEFAULT '240 20% 6%',
  nav_active_color TEXT NOT NULL DEFAULT '340 82% 52%',
  tab_active_color TEXT NOT NULL DEFAULT '340 82% 52%',
  card_border_color TEXT NOT NULL DEFAULT '340 82% 52%',
  header_gradient_from TEXT NOT NULL DEFAULT '340 82% 15%',
  header_gradient_to TEXT NOT NULL DEFAULT '280 60% 10%',
  
  -- Decorative elements
  floating_particles TEXT[] DEFAULT '{}',
  nav_decoration_style TEXT DEFAULT 'none',
  tab_decoration_style TEXT DEFAULT 'none',
  card_decoration_style TEXT DEFAULT 'none',
  
  -- Scheduling
  is_active BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  auto_schedule BOOLEAN NOT NULL DEFAULT false,
  
  -- Meta
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_event_themes ENABLE ROW LEVEL SECURITY;

-- Everyone can read active themes
CREATE POLICY "Anyone can read themes" ON public.app_event_themes
  FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage themes" ON public.app_event_themes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE app_event_themes;

-- Insert 12+ built-in event themes
INSERT INTO public.app_event_themes (theme_key, theme_name, theme_icon, description, primary_color, secondary_color, accent_color, nav_bg_color, nav_active_color, tab_active_color, card_border_color, header_gradient_from, header_gradient_to, floating_particles, nav_decoration_style, tab_decoration_style, card_decoration_style, display_order) VALUES
('ramadan', 'Ramadan Mubarak', '🌙', 'Holy month of Ramadan with crescent moon and stars', '45 93% 47%', '170 60% 40%', '45 93% 60%', '220 30% 8%', '45 93% 47%', '45 93% 47%', '45 80% 40%', '220 40% 12%', '170 30% 8%', ARRAY['🌙', '⭐', '✨'], 'crescent', 'golden_underline', 'golden_border', 1),

('eid_fitr', 'Eid ul-Fitr', '🎉', 'Celebration of Eid ul-Fitr with joy and festivities', '150 60% 45%', '45 93% 50%', '150 70% 55%', '150 25% 8%', '150 60% 45%', '150 60% 45%', '150 50% 40%', '150 30% 12%', '45 30% 8%', ARRAY['🎉', '🌙', '⭐', '🎊'], 'festive', 'green_glow', 'festive_border', 2),

('eid_adha', 'Eid ul-Adha', '🐑', 'Festival of sacrifice with golden elegance', '35 80% 50%', '20 70% 45%', '45 90% 55%', '25 25% 8%', '35 80% 50%', '35 80% 50%', '35 70% 45%', '25 30% 12%', '20 20% 8%', ARRAY['⭐', '✨', '🌙'], 'golden', 'golden_underline', 'golden_border', 3),

('christmas', 'Christmas', '🎄', 'Merry Christmas with snow and festive decorations', '0 72% 51%', '140 60% 35%', '45 93% 47%', '140 30% 8%', '0 72% 51%', '0 72% 51%', '0 60% 45%', '140 35% 12%', '0 30% 8%', ARRAY['❄️', '🎄', '⭐', '🎅'], 'snow', 'red_green', 'holly_border', 4),

('new_year', 'New Year', '🎆', 'Happy New Year celebration with fireworks', '270 60% 55%', '45 93% 50%', '200 80% 55%', '260 30% 8%', '270 60% 55%', '270 60% 55%', '270 50% 50%', '260 35% 15%', '45 20% 8%', ARRAY['🎆', '🎇', '✨', '🎊'], 'fireworks', 'sparkle', 'glow_border', 5),

('valentine', 'Valentine''s Day', '💕', 'Day of love with hearts and roses', '340 82% 52%', '330 70% 60%', '350 80% 65%', '340 30% 8%', '340 82% 52%', '340 82% 52%', '340 70% 50%', '340 40% 15%', '330 25% 8%', ARRAY['💕', '❤️', '💖', '🌹'], 'hearts', 'pink_glow', 'heart_border', 6),

('diwali', 'Diwali', '🪔', 'Festival of lights with diyas and rangoli', '35 90% 50%', '15 80% 45%', '50 95% 55%', '25 30% 8%', '35 90% 50%', '35 90% 50%', '35 80% 45%', '25 35% 12%', '15 25% 8%', ARRAY['🪔', '✨', '🎆', '⭐'], 'diya', 'fire_glow', 'rangoli_border', 7),

('durga_puja', 'Durga Puja', '🔱', 'Celebration of Goddess Durga with vermilion', '0 80% 50%', '45 90% 50%', '30 85% 55%', '0 25% 8%', '0 80% 50%', '0 80% 50%', '0 70% 45%', '0 30% 12%', '45 20% 8%', ARRAY['🔱', '🌺', '✨', '🪷'], 'vermilion', 'red_gold', 'puja_border', 8),

('halloween', 'Halloween', '🎃', 'Spooky Halloween with pumpkins and ghosts', '25 90% 50%', '270 60% 40%', '45 93% 47%', '270 30% 6%', '25 90% 50%', '25 90% 50%', '25 80% 45%', '270 35% 10%', '25 20% 6%', ARRAY['🎃', '👻', '🦇', '🕸️'], 'spooky', 'orange_glow', 'spooky_border', 9),

('thanksgiving', 'Thanksgiving', '🦃', 'Grateful Thanksgiving with autumn colors', '25 70% 45%', '35 60% 40%', '15 75% 50%', '25 25% 8%', '25 70% 45%', '25 70% 45%', '25 60% 40%', '25 30% 12%', '35 20% 8%', ARRAY['🍂', '🍁', '🦃', '✨'], 'autumn', 'warm_underline', 'autumn_border', 10),

('spring', 'Spring Festival', '🌸', 'Spring celebration with cherry blossoms', '330 65% 65%', '140 50% 50%', '45 90% 55%', '330 20% 8%', '330 65% 65%', '330 65% 65%', '330 55% 60%', '330 30% 12%', '140 20% 8%', ARRAY['🌸', '🌺', '🦋', '✨'], 'blossom', 'pink_green', 'floral_border', 11),

('independence', 'Independence Day', '🇧🇩', 'National pride and patriotic celebration', '140 70% 35%', '0 72% 45%', '45 93% 47%', '140 30% 8%', '140 70% 35%', '140 70% 35%', '140 60% 30%', '140 35% 12%', '0 25% 8%', ARRAY['🇧🇩', '⭐', '✨'], 'patriotic', 'national', 'flag_border', 12);
