
-- 1. topup_helper_levels
CREATE TABLE IF NOT EXISTS public.topup_helper_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  upgrade_cost_usd NUMERIC DEFAULT 0,
  min_withdrawal_amount NUMERIC DEFAULT 0,
  max_withdrawal_amount NUMERIC DEFAULT 0,
  commission_rate NUMERIC DEFAULT 0,
  badge_color TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.topup_helper_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read topup_helper_levels" ON public.topup_helper_levels FOR SELECT USING (true);

-- 2. diamond_exchange_packages
CREATE TABLE IF NOT EXISTS public.diamond_exchange_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beans_amount BIGINT NOT NULL DEFAULT 0,
  diamonds_reward BIGINT NOT NULL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diamond_exchange_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read diamond_exchange_packages" ON public.diamond_exchange_packages FOR SELECT USING (true);

-- 3. user_levels
CREATE TABLE IF NOT EXISTS public.user_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  diamonds_required BIGINT DEFAULT 0,
  description TEXT,
  badge_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read user_levels" ON public.user_levels FOR SELECT USING (true);

-- 4. Add columns to user_level_tiers
ALTER TABLE public.user_level_tiers ADD COLUMN IF NOT EXISTS tier_type TEXT DEFAULT 'user';
ALTER TABLE public.user_level_tiers ADD COLUMN IF NOT EXISTS level_icon TEXT;
ALTER TABLE public.user_level_tiers ADD COLUMN IF NOT EXISTS level_color TEXT;
ALTER TABLE public.user_level_tiers ADD COLUMN IF NOT EXISTS bg_gradient TEXT;
ALTER TABLE public.user_level_tiers ADD COLUMN IF NOT EXISTS animation_url TEXT;
ALTER TABLE public.user_level_tiers ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- 5. Temporarily disable RLS for import
ALTER TABLE public.topup_helper_levels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_exchange_packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_levels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_level_tiers DISABLE ROW LEVEL SECURITY;
