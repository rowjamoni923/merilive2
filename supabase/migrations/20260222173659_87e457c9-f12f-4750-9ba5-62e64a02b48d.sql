-- Add minimum target threshold to leaderboard reward config
ALTER TABLE public.leaderboard_reward_config 
ADD COLUMN IF NOT EXISTS min_target numeric DEFAULT 0;

COMMENT ON COLUMN public.leaderboard_reward_config.min_target IS 'Minimum earning/score threshold required to qualify for this reward';