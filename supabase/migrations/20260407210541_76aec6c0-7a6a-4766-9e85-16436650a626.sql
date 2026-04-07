
-- 1. violation_penalties
CREATE TABLE IF NOT EXISTS public.violation_penalties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  violation_number INTEGER NOT NULL,
  penalty_type TEXT NOT NULL,
  beans_amount BIGINT DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.violation_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read violation_penalties" ON public.violation_penalties FOR SELECT USING (true);

-- 2. registration_bonus_claims
CREATE TABLE IF NOT EXISTS public.registration_bonus_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bonus_coins INTEGER DEFAULT 0,
  granted_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.registration_bonus_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read registration_bonus_claims" ON public.registration_bonus_claims FOR SELECT USING (true);

-- 3. Add columns to vip_tiers
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS tier_code TEXT;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS price_diamonds INTEGER DEFAULT 0;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS badge_color TEXT;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS exclusive_frames BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS exclusive_entry_bars BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS exclusive_gifts BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS exclusive_bubbles BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS exclusive_stickers BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS priority_matching BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS ad_free BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS faster_support BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS vip_only_rooms BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS profile_highlight BOOLEAN DEFAULT false;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS frame_animation_url TEXT;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS entry_animation_url TEXT;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS bubble_animation_url TEXT;
ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS badge_animation_url TEXT;

-- Disable RLS for import
ALTER TABLE public.violation_penalties DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_bonus_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_tiers DISABLE ROW LEVEL SECURITY;
