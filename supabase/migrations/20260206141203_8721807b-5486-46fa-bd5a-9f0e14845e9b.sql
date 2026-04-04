
-- Add missing monthly reward tiers for game_winners
INSERT INTO public.leaderboard_reward_config (category, period_type, rank_from, rank_to, reward_coins, reward_diamonds, reward_beans, is_active)
VALUES
  ('game_winners', 'monthly', 1, 1, 0, 5000, 0, true),
  ('game_winners', 'monthly', 2, 2, 0, 3000, 0, true),
  ('game_winners', 'monthly', 3, 3, 0, 2000, 0, true),
  ('game_winners', 'monthly', 4, 10, 0, 1000, 0, true),
  ('game_winners', 'monthly', 11, 50, 0, 500, 0, true);
