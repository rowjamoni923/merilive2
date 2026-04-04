-- Create party room banners table for Big Win / City PK management
CREATE TABLE public.party_room_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  banner_type VARCHAR(50) NOT NULL, -- 'big_win', 'city_pk', 'daily_star', etc.
  title VARCHAR(100) NOT NULL,
  subtitle VARCHAR(200),
  amount DECIMAL(20, 2) DEFAULT 0,
  icon_emoji VARCHAR(10) DEFAULT '💎',
  gradient_from VARCHAR(50) DEFAULT '#8B5CF6',
  gradient_to VARCHAR(50) DEFAULT '#EC4899',
  link_type VARCHAR(50), -- 'game', 'pk_battle', 'event', 'external'
  link_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  min_room_level INTEGER DEFAULT 0,
  room_types TEXT[] DEFAULT ARRAY['audio', 'video', 'game']::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.party_room_banners ENABLE ROW LEVEL SECURITY;

-- Public read policy for all users
CREATE POLICY "Party room banners are viewable by everyone" 
ON public.party_room_banners 
FOR SELECT 
USING (is_active = true);

-- Authenticated users can view all banners (for admin panel)
CREATE POLICY "Authenticated can view all banners"
ON public.party_room_banners
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can manage banners (admin check done at app level)
CREATE POLICY "Authenticated can manage party room banners"
ON public.party_room_banners
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_party_room_banners_updated_at
BEFORE UPDATE ON public.party_room_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default banners
INSERT INTO public.party_room_banners (banner_type, title, subtitle, amount, icon_emoji, gradient_from, gradient_to, link_type, display_order) VALUES
('big_win', 'BIG WIN', 'Jackpot', 10730000, '💎', '#8B5CF6', '#F59E0B', 'game', 1),
('city_pk', 'City PK', 'Battle', 100000000, '🪙', '#06B6D4', '#8B5CF6', 'pk_battle', 2),
('daily_star', 'DAILY STAR', 'Today''s Top', 0, '⭐', '#F97316', '#EF4444', 'event', 3);