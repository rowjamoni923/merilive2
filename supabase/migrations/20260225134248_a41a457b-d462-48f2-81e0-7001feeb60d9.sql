
CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
 RETURNS TABLE(id uuid, display_name text, app_uid character varying, avatar_url text, country_flag text, host_level integer, user_level integer, frame_id uuid, stat_value bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN v_start_date := date_trunc('week', now());
  ELSE v_start_date := date_trunc('month', now()); END IF;

  RETURN QUERY
  WITH game_stats AS (
    SELECT gt.user_id AS uid, COALESCE(SUM(gt.amount), 0)::bigint AS total_volume
    FROM game_transactions gt 
    WHERE gt.created_at >= v_start_date
    GROUP BY gt.user_id 
    HAVING SUM(gt.amount) > 0
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id,
         gs.total_volume AS stat_value
  FROM game_stats gs INNER JOIN profiles p ON p.id = gs.uid
  ORDER BY gs.total_volume DESC LIMIT 50;
END; $function$;
