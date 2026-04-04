
-- Landing page content sections (managed from admin)
CREATE TABLE public.landing_page_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type TEXT NOT NULL CHECK (section_type IN ('hero_banner', 'feature', 'event', 'testimonial', 'faq', 'announcement')),
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  link_label TEXT,
  badge_text TEXT,
  icon_name TEXT,
  gradient_colors TEXT DEFAULT 'from-pink-500 to-purple-600',
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.landing_page_sections ENABLE ROW LEVEL SECURITY;

-- Public read for landing page
CREATE POLICY "Anyone can view active landing sections"
  ON public.landing_page_sections FOR SELECT
  USING (is_active = true);

-- Admin write access
CREATE POLICY "Admins can manage landing sections"
  ON public.landing_page_sections FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- Insert default content
INSERT INTO public.landing_page_sections (section_type, title, subtitle, description, icon_name, gradient_colors, display_order) VALUES
('feature', 'Live Streaming', 'Go live instantly', 'Stream to thousands of viewers with HD quality video and real-time interaction', 'Video', 'from-pink-500 to-rose-500', 1),
('feature', 'Video Calls', 'Crystal clear 1v1', 'Private HD video calls with face filters and virtual backgrounds', 'Phone', 'from-blue-500 to-cyan-500', 2),
('feature', 'Virtual Gifts', 'Express yourself', 'Send stunning animated gifts with SVGA effects during live streams', 'Gift', 'from-purple-500 to-violet-500', 3),
('feature', 'Party Rooms', 'Fun together', 'Create multi-host party rooms with music, games, and interactive activities', 'Music', 'from-orange-500 to-amber-500', 4),
('feature', 'Agency System', 'Build your empire', 'Recruit hosts, manage teams, and earn commission through our agency system', 'Users', 'from-emerald-500 to-green-500', 5),
('feature', 'Earn Money', 'Monetize your talent', 'Convert beans to real money through our transparent payout system', 'Wallet', 'from-yellow-500 to-orange-500', 6),
('event', '🎉 Grand Launch Event', 'Limited Time', 'Join our grand launch celebration! Special rewards and bonuses for all new users', NULL, 'from-pink-500 to-purple-600', 1),
('announcement', '📢 New Update Available', 'v2.0 Released', 'Experience the all-new MeriLive with redesigned UI, faster streaming, and exciting new features', NULL, 'from-blue-500 to-indigo-600', 1);

-- Trigger for updated_at
CREATE TRIGGER update_landing_page_sections_updated_at
  BEFORE UPDATE ON public.landing_page_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
