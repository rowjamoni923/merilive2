
-- Onboarding slides table for admin-managed welcome tutorial
CREATE TABLE public.onboarding_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  gradient TEXT NOT NULL DEFAULT 'from-primary to-accent',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_slides ENABLE ROW LEVEL SECURITY;

-- Anyone can read active slides (needed for onboarding before full auth)
CREATE POLICY "Anyone can read active onboarding slides"
  ON public.onboarding_slides FOR SELECT
  USING (is_active = true);

-- Seed default slides
INSERT INTO public.onboarding_slides (title, description, image_url, gradient, display_order) VALUES
  ('Welcome to meriLIVE!', 'Your new social entertainment hub. Meet amazing people, watch live streams, and have fun!', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/animations/onboarding/step-welcome.webp', 'from-primary to-accent', 1),
  ('Watch Live Streams', 'Discover talented hosts going live 24/7. Send gifts, chat, and make their day!', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/animations/onboarding/step-livestream.webp', 'from-pink-500 to-rose-500', 2),
  ('Join Party Rooms', 'Audio & video party rooms where you can hang out, sing karaoke, and play games!', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/animations/onboarding/step-party.webp', 'from-blue-500 to-cyan-500', 3),
  ('Private Video Calls', 'Connect 1-on-1 with hosts through private video calls. It''s fun and personal!', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/animations/onboarding/step-videocall.webp', 'from-red-500 to-orange-500', 4),
  ('You Got Free Coins!', 'We''ve given you welcome bonus coins to get started. Explore and enjoy!', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/animations/onboarding/step-bonus.webp', 'from-amber-500 to-yellow-500', 5);
