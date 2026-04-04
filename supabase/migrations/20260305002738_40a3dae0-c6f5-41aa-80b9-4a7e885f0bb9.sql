
-- Add unique constraint to prevent duplicate leaderboard reward distributions
-- This ensures that even if the edge function runs multiple times, only one reward per user/category/period is recorded
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_reward_history_unique 
ON public.leaderboard_reward_history (user_id, category, period_type, period_label);
