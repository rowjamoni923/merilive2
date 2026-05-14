
CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE start_date timestamptz;
BEGIN
  start_date := CASE p_period_type
    WHEN 'daily' THEN date_trunc('day', now())
    WHEN 'weekly' THEN date_trunc('week', now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE date_trunc('week', now()) END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         COALESCE(SUM(gt.receiver_beans),0)::bigint, p.frame_id
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.receiver_id
  WHERE gt.created_at >= start_date AND p.is_host = true
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id
  HAVING COALESCE(SUM(gt.receiver_beans),0) > 0
  ORDER BY 8 DESC LIMIT 50;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE start_date timestamptz;
BEGIN
  start_date := CASE p_period_type
    WHEN 'daily' THEN date_trunc('day', now())
    WHEN 'weekly' THEN date_trunc('week', now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE date_trunc('week', now()) END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         COALESCE(SUM(gb.payout),0)::bigint, p.frame_id
  FROM game_bets gb
  JOIN profiles p ON p.id = gb.player_id
  WHERE gb.created_at >= start_date AND COALESCE(gb.payout,0) > 0
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id
  HAVING COALESCE(SUM(gb.payout),0) > 0
  ORDER BY 8 DESC LIMIT 50;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(p_period_type text DEFAULT 'weekly'::text)
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE start_date timestamptz;
BEGIN
  start_date := CASE p_period_type
    WHEN 'daily' THEN date_trunc('day', now())
    WHEN 'weekly' THEN date_trunc('week', now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE date_trunc('week', now()) END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         COALESCE(SUM(gt.coin_cost),0)::bigint, p.frame_id
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.sender_id
  WHERE gt.created_at >= start_date
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id
  HAVING COALESCE(SUM(gt.coin_cost),0) > 0
  ORDER BY 8 DESC LIMIT 50;
END; $function$;
