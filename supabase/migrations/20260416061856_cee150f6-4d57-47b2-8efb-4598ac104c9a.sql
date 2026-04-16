
-- 1. Fix leaderboard_reward_config schema
ALTER TABLE public.leaderboard_reward_config
  ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS rank_from integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rank_to integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reward_coins integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_diamonds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_beans integer DEFAULT 0;

-- Make rank_position nullable so we can use rank_from/rank_to instead
ALTER TABLE public.leaderboard_reward_config ALTER COLUMN rank_position DROP NOT NULL;

-- 2. Fix ranking_rewards schema
ALTER TABLE public.ranking_rewards
  ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'weekly';

-- 3. Fix RPCs
DROP FUNCTION IF EXISTS public.get_host_earnings_leaderboard(text);
CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE start_date timestamptz;
BEGIN
  start_date := CASE p_period_type WHEN 'daily' THEN date_trunc('day', now()) WHEN 'weekly' THEN date_trunc('week', now()) WHEN 'monthly' THEN date_trunc('month', now()) ELSE date_trunc('week', now()) END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer, COALESCE(SUM(gt.receiver_earned),0)::bigint, p.frame_id
  FROM gift_transactions gt JOIN profiles p ON p.id = gt.receiver_id WHERE gt.created_at >= start_date AND p.is_host = true
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id ORDER BY 8 DESC LIMIT 100;
END; $$;

DROP FUNCTION IF EXISTS public.get_game_rankings_leaderboard(text);
CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE start_date timestamptz;
BEGIN
  start_date := CASE p_period_type WHEN 'daily' THEN date_trunc('day', now()) WHEN 'weekly' THEN date_trunc('week', now()) WHEN 'monthly' THEN date_trunc('month', now()) ELSE date_trunc('week', now()) END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer, COALESCE(SUM(gb.win_amount),0)::bigint, p.frame_id
  FROM game_bets gb JOIN profiles p ON p.id = gb.user_id WHERE gb.created_at >= start_date AND gb.status = 'won'
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id ORDER BY 8 DESC LIMIT 100;
END; $$;

DROP FUNCTION IF EXISTS public.get_top_gifters_leaderboard(text);
CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE start_date timestamptz;
BEGIN
  start_date := CASE p_period_type WHEN 'daily' THEN date_trunc('day', now()) WHEN 'weekly' THEN date_trunc('week', now()) WHEN 'monthly' THEN date_trunc('month', now()) ELSE date_trunc('week', now()) END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer, COALESCE(SUM(gt.coin_cost),0)::bigint, p.frame_id
  FROM gift_transactions gt JOIN profiles p ON p.id = gt.sender_id WHERE gt.created_at >= start_date
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id ORDER BY 8 DESC LIMIT 100;
END; $$;
