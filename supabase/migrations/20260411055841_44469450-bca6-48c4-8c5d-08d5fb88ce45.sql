
-- 1. Create onboarding_slides table
CREATE TABLE IF NOT EXISTS public.onboarding_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  gradient TEXT DEFAULT 'from-primary to-accent',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.onboarding_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_onboarding_slides" ON public.onboarding_slides
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "public_read_onboarding_slides" ON public.onboarding_slides
  FOR SELECT TO anon
  USING (is_active = true);

-- 2. Create vehicle_entrances table
CREATE TABLE IF NOT EXISTS public.vehicle_entrances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  animation_url TEXT,
  preview_url TEXT,
  sound_url TEXT,
  category TEXT DEFAULT 'general',
  price_coins INTEGER DEFAULT 0,
  price_diamonds INTEGER DEFAULT 0,
  level_required INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 3000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vehicle_entrances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_vehicle_entrances" ON public.vehicle_entrances
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "public_read_vehicle_entrances" ON public.vehicle_entrances
  FOR SELECT TO anon
  USING (is_active = true);

-- 3. Create game_rounds_stats view/table
CREATE TABLE IF NOT EXISTS public.game_rounds_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  game_emoji TEXT DEFAULT '🎮',
  total_rounds INTEGER DEFAULT 0,
  total_wagered BIGINT DEFAULT 0,
  total_players INTEGER DEFAULT 0,
  active_rounds INTEGER DEFAULT 0,
  last_round_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_rounds_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_game_rounds_stats" ON public.game_rounds_stats
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Add all new tables to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_slides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_entrances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rounds_stats;
