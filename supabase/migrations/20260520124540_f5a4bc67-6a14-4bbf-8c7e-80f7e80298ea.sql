
-- Pkg58: Leaderboard precision — female earnings (gift+call), male spending (gift+call+game),
-- Asia/Dhaka boundaries with 12:30 AM reset matching the reward cron.

CREATE OR REPLACE FUNCTION public.leaderboard_period_start(p_period_type text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_period_type
    WHEN 'daily' THEN
      ((date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka') - interval '30 minutes')
        + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka')
    WHEN 'weekly' THEN
      ((date_trunc('week', (now() AT TIME ZONE 'Asia/Dhaka') - interval '30 minutes')
        + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka')
    WHEN 'monthly' THEN
      ((date_trunc('month', (now() AT TIME ZONE 'Asia/Dhaka') - interval '30 minutes')
        + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka')
    ELSE
      ((date_trunc('week', (now() AT TIME ZONE 'Asia/Dhaka') - interval '30 minutes')
        + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka')
  END;
$$;

-- FEMALE / HOST: Gift beans received + Private-call earnings (host_earnings_amount)
CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
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
    FROM (
      SELECT uid, amt FROM gift_earn
      UNION ALL
      SELECT uid, amt FROM call_earn
    ) s
    GROUP BY uid
    HAVING SUM(amt) > 0
  )
  SELECT p.id, p.display_name::text, p.app_uid::text, p.avatar_url::text, p.country_flag::text,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         c.total, p.frame_id
  FROM combined c
  JOIN profiles p ON p.id = c.uid
  WHERE p.is_host = true AND public.is_real_user(p.id)
  ORDER BY c.total DESC
  LIMIT 50;
END; $function$;

-- MALE / TOP SPENDER: Gift coins spent + Call coins spent + Game bet diamonds spent
CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(p_period_type text DEFAULT 'weekly'::text)
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
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
    FROM (
      SELECT uid, amt FROM gift_spend
      UNION ALL SELECT uid, amt FROM call_spend
      UNION ALL SELECT uid, amt FROM game_spend
    ) s
    GROUP BY uid
    HAVING SUM(amt) > 0
  )
  SELECT p.id, p.display_name::text, p.app_uid::text, p.avatar_url::text, p.country_flag::text,
         COALESCE(p.host_level,1)::integer, COALESCE(p.user_level,1)::integer,
         c.total, p.frame_id
  FROM combined c
  JOIN profiles p ON p.id = c.uid
  WHERE public.is_real_user(p.id)
  ORDER BY c.total DESC
  LIMIT 50;
END; $function$;

-- GAME WINNERS: keep but align period boundary + filter real users
CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
RETURNS TABLE(id uuid, display_name text, app_uid text, avatar_url text, country_flag text, host_level integer, user_level integer, stat_value bigint, frame_id uuid)
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
         COALESCE(SUM(gb.payout),0)::bigint, p.frame_id
  FROM game_bets gb
  JOIN profiles p ON p.id = gb.player_id
  WHERE gb.created_at >= start_date
    AND COALESCE(gb.payout,0) > 0
    AND public.is_real_user(p.id)
  GROUP BY p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id
  HAVING COALESCE(SUM(gb.payout),0) > 0
  ORDER BY 8 DESC
  LIMIT 50;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_host_earnings_leaderboard(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_gifters_leaderboard(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_game_rankings_leaderboard(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard_period_start(text) TO authenticated, anon;
