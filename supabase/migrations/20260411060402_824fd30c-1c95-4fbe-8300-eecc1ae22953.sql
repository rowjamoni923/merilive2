
-- 1. Add primary key to gifts table
ALTER TABLE public.gifts ADD CONSTRAINT gifts_pkey PRIMARY KEY (id);

-- 2. Add min_level and is_lucky to gifts table  
ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS min_level INTEGER DEFAULT 0;
ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS is_lucky BOOLEAN DEFAULT false;

-- 3. Create lucky_gift_config table
CREATE TABLE IF NOT EXISTS public.lucky_gift_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id UUID REFERENCES public.gifts(id) ON DELETE CASCADE,
  diamond_reward INTEGER NOT NULL DEFAULT 1,
  win_chance_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lucky_gift_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_lucky_gift_config" ON public.lucky_gift_config
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "users_read_lucky_gift_config" ON public.lucky_gift_config
  FOR SELECT TO authenticated USING (is_active = true);

-- 4. Create lucky_gift_results table
CREATE TABLE IF NOT EXISTS public.lucky_gift_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gift_id UUID REFERENCES public.gifts(id),
  receiver_id UUID NOT NULL,
  diamonds_won INTEGER DEFAULT 0,
  is_winner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lucky_gift_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_lucky_gift_results" ON public.lucky_gift_results
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "users_read_own_lucky_results" ON public.lucky_gift_results
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_lucky_results" ON public.lucky_gift_results
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 5. Update gift_categories
DELETE FROM public.gift_categories;

INSERT INTO public.gift_categories (id, name, icon_url, display_order, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Wall', null, 1, true),
  ('22222222-2222-2222-2222-222222222222', 'Lucky', null, 2, true),
  ('33333333-3333-3333-3333-333333333333', 'Luxurious', null, 3, true),
  ('44444444-4444-4444-4444-444444444444', 'VIP', null, 4, true),
  ('55555555-5555-5555-5555-555555555555', 'Pro', null, 5, true);

-- 6. Update existing gifts to wall category
UPDATE public.gifts SET category = 'wall' WHERE category IS NULL OR category NOT IN ('wall', 'lucky', 'luxurious', 'vip', 'pro');

-- 7. Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lucky_gift_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lucky_gift_results;
