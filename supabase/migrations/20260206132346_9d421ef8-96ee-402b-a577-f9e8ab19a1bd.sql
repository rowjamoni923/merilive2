
-- Game Leaderboard Rewards table for admin to configure and send rewards
CREATE TABLE public.game_leaderboard_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  rank_position INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_diamonds INTEGER NOT NULL DEFAULT 0,
  reward_badge TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track sent rewards history
CREATE TABLE public.game_reward_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  period_type TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  rank_position INTEGER NOT NULL,
  total_wins INTEGER DEFAULT 0,
  total_amount_won INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  reward_diamonds INTEGER DEFAULT 0,
  reward_badge TEXT DEFAULT NULL,
  sent_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_leaderboard_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_reward_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for game_leaderboard_rewards (admin manage, public read)
CREATE POLICY "Anyone can view leaderboard rewards config"
ON public.game_leaderboard_rewards FOR SELECT USING (true);

CREATE POLICY "Admins can manage leaderboard rewards"
ON public.game_leaderboard_rewards FOR ALL
USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

-- RLS policies for game_reward_history
CREATE POLICY "Users can view their own reward history"
ON public.game_reward_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reward history"
ON public.game_reward_history FOR SELECT
USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Admins can insert reward history"
ON public.game_reward_history FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

-- Insert default reward config
INSERT INTO public.game_leaderboard_rewards (period_type, rank_position, reward_coins, reward_diamonds) VALUES
('daily', 1, 500, 100),
('daily', 2, 300, 50),
('daily', 3, 200, 30),
('weekly', 1, 3000, 500),
('weekly', 2, 2000, 300),
('weekly', 3, 1000, 150),
('monthly', 1, 10000, 2000),
('monthly', 2, 7000, 1200),
('monthly', 3, 5000, 800);

-- Trigger for updated_at
CREATE TRIGGER update_game_leaderboard_rewards_updated_at
BEFORE UPDATE ON public.game_leaderboard_rewards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
