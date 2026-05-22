DROP FUNCTION IF EXISTS public.get_host_earnings_leaderboard(text);
DROP FUNCTION IF EXISTS public.get_game_rankings_leaderboard(text);
DROP FUNCTION IF EXISTS public.get_top_gifters_leaderboard(text);

CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
 RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, max_user_level integer, gender text, is_host boolean, stat_value bigint, frame_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE start_date timestamptz;
BEGIN
  start_date := public.leaderboard_period_start(p_period_type);
  RETURN QUERY
  WITH gift_earn AS (
    SELECT gt.receiver_id AS uid, COALESCE(SUM(gt.receiver_beans),0)::bigint AS amt
    FROM gift_transactions gt
    WHERE gt.created_at >= start_date AND gt.receiver_id IS NOT NULL
    GROUP BY gt.receiver_id
  ),
  call_earn AS (
    SELECT pc.host_id AS uid,
           COALESCE(SUM(COALESCE(pc.host_earnings_amount, pc.host_earned, 0)),0)::bigint AS amt
    FROM private_calls pc
    WHERE pc.ended_at >= start_date AND pc.host_id IS NOT NULL
    GROUP BY pc.host_id
  ),
  combined AS (
    SELECT uid, SUM(amt)::bigint AS total
    FROM (SELECT uid, amt FROM gift_earn UNION ALL SELECT uid, amt FROM call_earn) s
    GROUP BY uid HAVING SUM(amt) > 0
  )
  SELECT p.id, p.display_name::text, p.app_uid::text, p.avatar_url::text, p.country_flag::text,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         COALESCE(p.max_user_level,1)::integer, p.gender::text, p.is_host,
         c.total, p.frame_id
  FROM combined c
  JOIN profiles p ON p.id = c.uid
  WHERE p.is_host = true
    AND LOWER(COALESCE(p.gender,'')) = 'female'
  ORDER BY c.total DESC LIMIT 50;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
 RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, max_user_level integer, gender text, is_host boolean, stat_value bigint, frame_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE start_date timestamptz;
BEGIN
  start_date := public.leaderboard_period_start(p_period_type);
  RETURN QUERY
  SELECT p.id, p.display_name::text, p.app_uid::text, p.avatar_url::text, p.country_flag::text,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         COALESCE(p.max_user_level,1)::integer, p.gender::text, p.is_host,
         COALESCE(SUM(gb.payout),0)::bigint, p.frame_id
  FROM game_bets gb
  JOIN profiles p ON p.id = gb.player_id
  WHERE gb.created_at >= start_date AND COALESCE(gb.payout,0) > 0
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.max_user_level, p.gender, p.is_host, p.frame_id
  HAVING COALESCE(SUM(gb.payout),0) > 0
  ORDER BY 11 DESC LIMIT 50;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(p_period_type text DEFAULT 'weekly'::text)
 RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, max_user_level integer, gender text, is_host boolean, stat_value bigint, frame_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE start_date timestamptz;
BEGIN
  start_date := public.leaderboard_period_start(p_period_type);
  RETURN QUERY
  WITH gift_spend AS (
    SELECT gt.sender_id AS uid, COALESCE(SUM(gt.coin_cost),0)::bigint AS amt
    FROM gift_transactions gt
    WHERE gt.created_at >= start_date AND gt.sender_id IS NOT NULL
    GROUP BY gt.sender_id
  ),
  call_spend AS (
    SELECT pc.caller_id AS uid,
           COALESCE(SUM(COALESCE(pc.total_coins_deducted, pc.coins_spent, 0)),0)::bigint AS amt
    FROM private_calls pc
    WHERE pc.ended_at >= start_date AND pc.caller_id IS NOT NULL
    GROUP BY pc.caller_id
  ),
  game_spend AS (
    SELECT gb.player_id AS uid, COALESCE(SUM(gb.bet_amount),0)::bigint AS amt
    FROM game_bets gb
    WHERE gb.created_at >= start_date AND gb.player_id IS NOT NULL
    GROUP BY gb.player_id
  ),
  combined AS (
    SELECT uid, SUM(amt)::bigint AS total
    FROM (SELECT uid, amt FROM gift_spend UNION ALL SELECT uid, amt FROM call_spend UNION ALL SELECT uid, amt FROM game_spend) s
    GROUP BY uid HAVING SUM(amt) > 0
  )
  SELECT p.id, p.display_name::text, p.app_uid::text, p.avatar_url::text, p.country_flag::text,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         COALESCE(p.max_user_level,1)::integer, p.gender::text, p.is_host,
         c.total, p.frame_id
  FROM combined c
  JOIN profiles p ON p.id = c.uid
  WHERE LOWER(COALESCE(p.gender,'')) = 'male'
  ORDER BY c.total DESC LIMIT 50;
END; $function$;