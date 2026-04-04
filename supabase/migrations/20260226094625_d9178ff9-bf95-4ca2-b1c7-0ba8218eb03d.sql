
-- ========================================
-- 1. First Recharge Bonus Configuration
-- ========================================
CREATE TABLE public.first_recharge_bonus (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bonus_multiplier NUMERIC NOT NULL DEFAULT 2.0,
  bonus_label TEXT NOT NULL DEFAULT '2x Bonus',
  description TEXT DEFAULT 'Get double coins on your first recharge!',
  is_active BOOLEAN NOT NULL DEFAULT true,
  min_package_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.first_recharge_bonus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read first recharge bonus config"
  ON public.first_recharge_bonus FOR SELECT USING (true);

-- Insert default config
INSERT INTO public.first_recharge_bonus (bonus_multiplier, bonus_label, description)
VALUES (2.0, '2x Bonus', 'Get double coins on your first recharge!');

-- Track which users have claimed their first recharge bonus
CREATE TABLE public.first_recharge_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  package_id UUID,
  original_coins INTEGER NOT NULL,
  bonus_coins INTEGER NOT NULL,
  total_coins INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.first_recharge_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own claims"
  ON public.first_recharge_claims FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert claims"
  ON public.first_recharge_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_first_recharge_claims_user ON public.first_recharge_claims(user_id);

-- ========================================
-- 2. Consumption Return / Cashback System
-- ========================================
CREATE TABLE public.consumption_return_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier_name TEXT NOT NULL,
  min_spend INTEGER NOT NULL DEFAULT 0,
  max_spend INTEGER,
  return_percentage NUMERIC NOT NULL DEFAULT 5.0,
  max_return_coins INTEGER,
  period_type TEXT NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consumption_return_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read consumption return config"
  ON public.consumption_return_config FOR SELECT USING (true);

-- Insert default tiers
INSERT INTO public.consumption_return_config (tier_name, min_spend, max_spend, return_percentage, max_return_coins, period_type, display_order)
VALUES 
  ('Bronze', 100, 999, 3.0, 30, 'weekly', 1),
  ('Silver', 1000, 4999, 5.0, 250, 'weekly', 2),
  ('Gold', 5000, 19999, 8.0, 1600, 'weekly', 3),
  ('Diamond', 20000, NULL, 12.0, NULL, 'weekly', 4);

-- Track consumption return history
CREATE TABLE public.consumption_return_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  period_type TEXT NOT NULL,
  period_label TEXT NOT NULL,
  total_spent INTEGER NOT NULL DEFAULT 0,
  return_percentage NUMERIC NOT NULL,
  return_coins INTEGER NOT NULL,
  tier_name TEXT NOT NULL,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consumption_return_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own return history"
  ON public.consumption_return_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can claim their returns"
  ON public.consumption_return_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_consumption_return_user ON public.consumption_return_history(user_id, period_label);

-- ========================================
-- 3. Daily Login Rewards
-- ========================================
CREATE TABLE public.daily_login_rewards_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_number INTEGER NOT NULL, -- 1-7
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_diamonds INTEGER NOT NULL DEFAULT 0,
  reward_beans INTEGER NOT NULL DEFAULT 0,
  bonus_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_login_rewards_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read login rewards config"
  ON public.daily_login_rewards_config FOR SELECT USING (true);

-- 7-day cycle rewards
INSERT INTO public.daily_login_rewards_config (day_number, reward_coins, reward_diamonds, bonus_label)
VALUES 
  (1, 5, 0, 'Day 1'),
  (2, 10, 0, 'Day 2'),
  (3, 15, 0, 'Day 3'),
  (4, 20, 5, 'Day 4'),
  (5, 30, 5, 'Day 5'),
  (6, 50, 10, 'Day 6'),
  (7, 100, 20, '🎁 Day 7 Bonus!');

-- Track user login streaks
CREATE TABLE public.user_login_streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  total_logins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_login_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak"
  ON public.user_login_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own streak"
  ON public.user_login_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streak"
  ON public.user_login_streaks FOR UPDATE
  USING (auth.uid() = user_id);

-- Daily login claim history
CREATE TABLE public.daily_login_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day_number INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_diamonds INTEGER NOT NULL DEFAULT 0,
  claimed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_login_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own claims"
  ON public.daily_login_claims FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own claims"
  ON public.daily_login_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_daily_login_claims_unique ON public.daily_login_claims(user_id, claimed_date);

-- ========================================
-- 4. Limited Time Offers
-- ========================================
CREATE TABLE public.limited_time_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  offer_type TEXT NOT NULL DEFAULT 'bonus', -- bonus, discount, bundle
  bonus_percentage INTEGER DEFAULT 50,
  applicable_packages UUID[],
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  max_claims_per_user INTEGER DEFAULT 1,
  total_max_claims INTEGER,
  total_claimed INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  banner_image_url TEXT,
  badge_text TEXT DEFAULT 'LIMITED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.limited_time_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active offers"
  ON public.limited_time_offers FOR SELECT USING (true);

-- Track who claimed limited offers
CREATE TABLE public.limited_offer_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  offer_id UUID NOT NULL REFERENCES public.limited_time_offers(id),
  coins_received INTEGER NOT NULL DEFAULT 0,
  bonus_received INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.limited_offer_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own offer claims"
  ON public.limited_offer_claims FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can claim offers"
  ON public.limited_offer_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_limited_offer_claims_user ON public.limited_offer_claims(user_id, offer_id);

-- Insert a sample limited offer (50% bonus for 24 hours)
INSERT INTO public.limited_time_offers (title, description, offer_type, bonus_percentage, ends_at, badge_text)
VALUES ('🔥 Launch Special', 'Get 50% extra coins on any recharge!', 'bonus', 50, now() + interval '7 days', 'LIMITED TIME');
