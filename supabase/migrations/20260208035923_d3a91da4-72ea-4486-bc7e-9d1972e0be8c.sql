-- Step 1: Update the category check constraint to include 'top_gifters'
ALTER TABLE leaderboard_reward_config DROP CONSTRAINT leaderboard_reward_config_category_check;
ALTER TABLE leaderboard_reward_config ADD CONSTRAINT leaderboard_reward_config_category_check 
  CHECK (category = ANY (ARRAY['host_earnings', 'game_winners', 'agency_performance', 'pk_reward', 'top_gifters']));

-- Step 2: Insert top_gifters reward config (daily, weekly, monthly)
INSERT INTO leaderboard_reward_config (category, period_type, rank_from, rank_to, reward_beans, reward_diamonds, reward_coins, is_active)
VALUES
-- Daily gifter rewards
('top_gifters', 'daily', 1, 1, 0, 50000, 0, true),
('top_gifters', 'daily', 2, 2, 0, 30000, 0, true),
('top_gifters', 'daily', 3, 3, 0, 20000, 0, true),
('top_gifters', 'daily', 4, 10, 0, 10000, 0, true),
('top_gifters', 'daily', 11, 50, 0, 5000, 0, true),
-- Weekly gifter rewards
('top_gifters', 'weekly', 1, 1, 0, 200000, 0, true),
('top_gifters', 'weekly', 2, 2, 0, 100000, 0, true),
('top_gifters', 'weekly', 3, 3, 0, 50000, 0, true),
('top_gifters', 'weekly', 4, 10, 0, 25000, 0, true),
('top_gifters', 'weekly', 11, 50, 0, 10000, 0, true),
-- Monthly gifter rewards
('top_gifters', 'monthly', 1, 1, 0, 1000000, 0, true),
('top_gifters', 'monthly', 2, 2, 0, 500000, 0, true),
('top_gifters', 'monthly', 3, 3, 0, 200000, 0, true),
('top_gifters', 'monthly', 4, 10, 0, 100000, 0, true),
('top_gifters', 'monthly', 11, 50, 0, 50000, 0, true);