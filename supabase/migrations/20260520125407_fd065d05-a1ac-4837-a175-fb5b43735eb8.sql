INSERT INTO leaderboard_reward_config (leaderboard_type, reward_type, reward_amount, category, period_type, rank_from, rank_to, reward_coins, reward_diamonds, reward_beans, is_active)
SELECT leaderboard_type, reward_type, 0, category, period_type, 11, 25,
       FLOOR(reward_coins    * 0.5)::int,
       FLOOR(reward_diamonds * 0.5)::int,
       FLOOR(reward_beans    * 0.5)::int,
       true
FROM leaderboard_reward_config
WHERE rank_from = 4 AND rank_to = 10 AND is_active = true;

INSERT INTO leaderboard_reward_config (leaderboard_type, reward_type, reward_amount, category, period_type, rank_from, rank_to, reward_coins, reward_diamonds, reward_beans, is_active)
SELECT leaderboard_type, reward_type, 0, category, period_type, 26, 50,
       FLOOR(reward_coins    * 0.25)::int,
       FLOOR(reward_diamonds * 0.25)::int,
       FLOOR(reward_beans    * 0.25)::int,
       true
FROM leaderboard_reward_config
WHERE rank_from = 4 AND rank_to = 10 AND is_active = true;