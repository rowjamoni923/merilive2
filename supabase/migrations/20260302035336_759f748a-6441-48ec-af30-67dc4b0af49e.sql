
-- Debug function to test the reward distribution flow
CREATE OR REPLACE FUNCTION public.debug_distribute_test(p_category TEXT, p_period_type TEXT)
RETURNS TABLE(step TEXT, detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_period_label TEXT;
  v_count INTEGER := 0;
  v_already BOOLEAN;
BEGIN
  IF p_period_type = 'daily' THEN
    v_end_date := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := 'daily_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    v_end_date := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 week';
    v_period_label := 'weekly_' || to_char(v_start_date, 'YYYY-MM-DD');
  END IF;

  step := 'dates'; detail := v_start_date::text || ' -> ' || v_end_date::text || ' label=' || v_period_label;
  RETURN NEXT;

  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;
  step := 'idempotency'; detail := v_already::text;
  RETURN NEXT;

  IF p_category = 'host_earnings' THEN
    SELECT COUNT(*) INTO v_count FROM (
      WITH gift_stats AS (
        SELECT gt.receiver_id AS user_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS total
        FROM gift_transactions gt
        INNER JOIN profiles p ON p.id = gt.receiver_id AND p.is_host = true
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
        GROUP BY gt.receiver_id
      ),
      call_stats AS (
        SELECT pc.host_id AS user_id, SUM(pc.host_earnings_amount) AS total
        FROM private_calls pc
        INNER JOIN profiles p ON p.id = pc.host_id AND p.is_host = true
        WHERE pc.created_at >= v_start_date AND pc.created_at < v_end_date AND pc.status = 'completed'
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT COALESCE(g.user_id, c.user_id) AS user_id,
               COALESCE(g.total, 0) + COALESCE(c.total, 0) AS stat_value
        FROM gift_stats g FULL OUTER JOIN call_stats c ON g.user_id = c.user_id
      )
      SELECT user_id, stat_value FROM combined
      WHERE user_id IS NOT NULL AND stat_value > 0
      AND user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      ORDER BY stat_value DESC LIMIT 50
    ) sub;
    step := 'host_earnings_count'; detail := v_count::text;
    RETURN NEXT;
  END IF;

  -- Check reward config
  SELECT COUNT(*) INTO v_count FROM leaderboard_reward_config 
  WHERE category = p_category AND period_type = p_period_type AND is_active = true;
  step := 'reward_config_count'; detail := v_count::text;
  RETURN NEXT;
END;
$$;
