
-- 1. Host Earnings Leaderboard
CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(
  p_period_type text DEFAULT 'weekly'
)
RETURNS TABLE(
  id uuid,
  display_name text,
  app_uid text,
  avatar_url text,
  country_flag text,
  host_level int4,
  user_level int4,
  frame_id text,
  stat_value bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN
    v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN
    v_start_date := date_trunc('week', now());
  ELSE
    v_start_date := date_trunc('month', now());
  END IF;

  RETURN QUERY
  WITH host_ids AS (
    SELECT p.id FROM profiles p WHERE p.is_host = true
  ),
  gift_earnings AS (
    SELECT gt.receiver_id AS uid, COALESCE(SUM(FLOOR(gt.coin_amount * 0.6)), 0)::bigint AS beans
    FROM gift_transactions gt
    INNER JOIN host_ids h ON h.id = gt.receiver_id
    WHERE gt.created_at >= v_start_date
    GROUP BY gt.receiver_id
  ),
  call_earnings AS (
    SELECT pc.host_id AS uid, COALESCE(SUM(pc.host_earnings_amount), 0)::bigint AS beans
    FROM private_calls pc
    INNER JOIN host_ids h ON h.id = pc.host_id
    WHERE pc.created_at >= v_start_date AND pc.status = 'completed'
    GROUP BY pc.host_id
  ),
  combined AS (
    SELECT COALESCE(g.uid, c.uid) AS uid,
           (COALESCE(g.beans, 0) + COALESCE(c.beans, 0))::bigint AS total_beans
    FROM gift_earnings g
    FULL OUTER JOIN call_earnings c ON g.uid = c.uid
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag,
         p.host_level, p.user_level, p.frame_id,
         cm.total_beans AS stat_value
  FROM combined cm
  INNER JOIN profiles p ON p.id = cm.uid
  WHERE cm.total_beans > 0
  ORDER BY cm.total_beans DESC
  LIMIT 50;
END;
$$;

-- 2. Game Rankings Leaderboard
CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(
  p_period_type text DEFAULT 'weekly'
)
RETURNS TABLE(
  id uuid,
  display_name text,
  app_uid text,
  avatar_url text,
  country_flag text,
  host_level int4,
  user_level int4,
  frame_id text,
  stat_value bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN
    v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN
    v_start_date := date_trunc('week', now());
  ELSE
    v_start_date := date_trunc('month', now());
  END IF;

  RETURN QUERY
  WITH game_stats AS (
    SELECT gt.user_id AS uid, COUNT(*)::bigint AS total_bets
    FROM game_transactions gt
    WHERE gt.created_at >= v_start_date
    GROUP BY gt.user_id
    HAVING COUNT(*) > 0
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag,
         p.host_level, p.user_level, p.frame_id,
         gs.total_bets AS stat_value
  FROM game_stats gs
  INNER JOIN profiles p ON p.id = gs.uid
  ORDER BY gs.total_bets DESC
  LIMIT 50;
END;
$$;

-- 3. Top Gifters Leaderboard
CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(
  p_period_type text DEFAULT 'weekly'
)
RETURNS TABLE(
  id uuid,
  display_name text,
  app_uid text,
  avatar_url text,
  country_flag text,
  host_level int4,
  user_level int4,
  frame_id text,
  stat_value bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN
    v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN
    v_start_date := date_trunc('week', now());
  ELSE
    v_start_date := date_trunc('month', now());
  END IF;

  RETURN QUERY
  WITH gifter_stats AS (
    SELECT gt.sender_id AS uid, COALESCE(SUM(gt.coin_amount), 0)::bigint AS total_sent
    FROM gift_transactions gt
    WHERE gt.created_at >= v_start_date
    GROUP BY gt.sender_id
    HAVING SUM(gt.coin_amount) > 0
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag,
         p.host_level, p.user_level, p.frame_id,
         gs.total_sent AS stat_value
  FROM gifter_stats gs
  INNER JOIN profiles p ON p.id = gs.uid
  ORDER BY gs.total_sent DESC
  LIMIT 50;
END;
$$;
