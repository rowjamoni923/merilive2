
-- Unschedule the hourly cron and create daily at 18:30 UTC (12:30 AM BST)
SELECT cron.unschedule('leaderboard-rewards-hourly');

-- Create new daily cron at 18:30 UTC = 12:30 AM BST
SELECT cron.schedule(
  'leaderboard-rewards-daily',
  '30 18 * * *',
  $$SELECT public.auto_distribute_leaderboard_rewards()$$
);
