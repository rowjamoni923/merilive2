
-- ============================================
-- UNIFIED LEADERBOARD REWARD SYSTEM
-- Covers: Host Earnings, Game, Agency, PK
-- ============================================

-- 1. Unified Reward Config Table (replaces game-only rewards)
-- Admin configures reward amounts for each category, period, and rank tier
DROP TABLE IF EXISTS public.game_reward_history CASCADE;
DROP TABLE IF EXISTS public.game_leaderboard_rewards CASCADE;

CREATE TABLE public.leaderboard_reward_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('host_earnings', 'game_winners', 'agency_performance', 'pk_reward')),
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  rank_from INTEGER NOT NULL DEFAULT 1,
  rank_to INTEGER NOT NULL DEFAULT 1,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_diamonds INTEGER NOT NULL DEFAULT 0,
  reward_beans INTEGER NOT NULL DEFAULT 0,
  reward_badge TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Reward Distribution History
-- Tracks all rewards sent (for auditing and preventing double-send)
CREATE TABLE public.leaderboard_reward_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  agency_id UUID REFERENCES agencies(id),
  category TEXT NOT NULL,
  period_type TEXT NOT NULL,
  period_label TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  stat_value BIGINT DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  reward_diamonds INTEGER DEFAULT 0,
  reward_beans INTEGER DEFAULT 0,
  reward_badge TEXT DEFAULT NULL,
  sent_by UUID DEFAULT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. PK Reward Banner Config (admin sets banners with reward info)
CREATE TABLE public.pk_reward_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  banner_image_url TEXT,
  reward_details JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leaderboard_reward_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_reward_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pk_reward_banners ENABLE ROW LEVEL SECURITY;

-- RLS: leaderboard_reward_config
CREATE POLICY "Anyone can view reward config"
ON public.leaderboard_reward_config FOR SELECT USING (true);

CREATE POLICY "Admins can manage reward config"
ON public.leaderboard_reward_config FOR ALL
USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

-- RLS: leaderboard_reward_history
CREATE POLICY "Users can view their own reward history"
ON public.leaderboard_reward_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reward history"
ON public.leaderboard_reward_history FOR SELECT
USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Admins can insert reward history"
ON public.leaderboard_reward_history FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

-- RLS: pk_reward_banners
CREATE POLICY "Anyone can view active PK banners"
ON public.pk_reward_banners FOR SELECT USING (true);

CREATE POLICY "Admins can manage PK banners"
ON public.pk_reward_banners FOR ALL
USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

-- Triggers
CREATE TRIGGER update_leaderboard_reward_config_updated_at
BEFORE UPDATE ON public.leaderboard_reward_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pk_reward_banners_updated_at
BEFORE UPDATE ON public.pk_reward_banners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default Reward Config: Host Earnings (Top 50 tiers)
INSERT INTO public.leaderboard_reward_config (category, period_type, rank_from, rank_to, reward_beans) VALUES
('host_earnings', 'daily', 1, 1, 5000),
('host_earnings', 'daily', 2, 2, 3000),
('host_earnings', 'daily', 3, 3, 2000),
('host_earnings', 'daily', 4, 10, 1000),
('host_earnings', 'daily', 11, 20, 500),
('host_earnings', 'daily', 21, 50, 200),
('host_earnings', 'weekly', 1, 1, 25000),
('host_earnings', 'weekly', 2, 2, 15000),
('host_earnings', 'weekly', 3, 3, 10000),
('host_earnings', 'weekly', 4, 10, 5000),
('host_earnings', 'weekly', 11, 50, 2000),
('host_earnings', 'monthly', 1, 1, 100000),
('host_earnings', 'monthly', 2, 2, 60000),
('host_earnings', 'monthly', 3, 3, 40000),
('host_earnings', 'monthly', 4, 10, 20000),
('host_earnings', 'monthly', 11, 50, 5000);

-- Default: Game Winners
INSERT INTO public.leaderboard_reward_config (category, period_type, rank_from, rank_to, reward_diamonds) VALUES
('game_winners', 'daily', 1, 1, 500),
('game_winners', 'daily', 2, 2, 300),
('game_winners', 'daily', 3, 3, 200),
('game_winners', 'daily', 4, 10, 100),
('game_winners', 'daily', 11, 50, 50),
('game_winners', 'weekly', 1, 1, 3000),
('game_winners', 'weekly', 2, 2, 2000),
('game_winners', 'weekly', 3, 3, 1000),
('game_winners', 'weekly', 4, 10, 500),
('game_winners', 'weekly', 11, 50, 200);

-- Default: Agency Performance
INSERT INTO public.leaderboard_reward_config (category, period_type, rank_from, rank_to, reward_diamonds) VALUES
('agency_performance', 'weekly', 1, 1, 10000),
('agency_performance', 'weekly', 2, 2, 7000),
('agency_performance', 'weekly', 3, 3, 5000),
('agency_performance', 'weekly', 4, 10, 2000),
('agency_performance', 'weekly', 11, 50, 1000),
('agency_performance', 'monthly', 1, 1, 50000),
('agency_performance', 'monthly', 2, 2, 30000),
('agency_performance', 'monthly', 3, 3, 20000),
('agency_performance', 'monthly', 4, 10, 10000),
('agency_performance', 'monthly', 11, 50, 3000);

-- Default: PK Reward
INSERT INTO public.leaderboard_reward_config (category, period_type, rank_from, rank_to, reward_diamonds) VALUES
('pk_reward', 'daily', 1, 1, 1000),
('pk_reward', 'daily', 2, 2, 700),
('pk_reward', 'daily', 3, 3, 500),
('pk_reward', 'daily', 4, 10, 200),
('pk_reward', 'daily', 11, 50, 100);
