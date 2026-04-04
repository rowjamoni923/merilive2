
-- Fix 1: Add default value to sent_at so distributions actually work
ALTER TABLE leaderboard_reward_history ALTER COLUMN sent_at SET DEFAULT now();

-- Fix 2: Recreate distribute_period_rewards with sent_at included
CREATE OR REPLACE FUNCTION distribute_period_rewards(p_category TEXT, p_period_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_period_label TEXT;
  v_count INTEGER := 0;
  v_reward RECORD;
  v_entry RECORD;
  v_rank INTEGER := 0;
  v_already BOOLEAN;
BEGIN
  -- Pure UTC period calculation
  IF p_period_type = 'daily' THEN
    v_end_date := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := 'daily_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    v_end_date := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 week';
    v_period_label := 'weekly_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'monthly' THEN
    v_end_date := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'monthly_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSE
    RETURN 0;
  END IF;

  -- Idempotency check
  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;

  IF v_already THEN RETURN 0; END IF;

  -- host_earnings
  IF p_category = 'host_earnings' THEN
    FOR v_entry IN (
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
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config WHERE category = p_category AND period_type = p_period_type AND is_active = true AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN PERFORM _internal_add_beans(v_entry.user_id, v_reward.reward_beans); END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN PERFORM _internal_add_diamonds(v_entry.user_id, v_reward.reward_diamonds); END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN PERFORM _internal_add_coins(v_entry.user_id, v_reward.reward_coins); END IF;
        INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_diamonds,0), COALESCE(v_reward.reward_beans,0), now());
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward', '🏆 Leaderboard Reward!',
          'You ranked #' || v_rank || ' in ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Earnings!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- game_winners
  IF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.user_id, SUM(gt.amount) AS stat_value
      FROM game_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      AND gt.transaction_type = 'win' AND gt.amount > 0
      AND gt.user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      GROUP BY gt.user_id
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config WHERE category = p_category AND period_type = p_period_type AND is_active = true AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN PERFORM _internal_add_beans(v_entry.user_id, v_reward.reward_beans); END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN PERFORM _internal_add_diamonds(v_entry.user_id, v_reward.reward_diamonds); END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN PERFORM _internal_add_coins(v_entry.user_id, v_reward.reward_coins); END IF;
        INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_diamonds,0), COALESCE(v_reward.reward_beans,0), now());
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward', '🏆 Leaderboard Reward!',
          'You ranked #' || v_rank || ' in ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Ranking!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- top_gifters
  IF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.sender_id AS user_id, SUM(gt.coin_amount) AS stat_value
      FROM gift_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      AND gt.sender_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      GROUP BY gt.sender_id
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config WHERE category = p_category AND period_type = p_period_type AND is_active = true AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN PERFORM _internal_add_beans(v_entry.user_id, v_reward.reward_beans); END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN PERFORM _internal_add_diamonds(v_entry.user_id, v_reward.reward_diamonds); END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN PERFORM _internal_add_coins(v_entry.user_id, v_reward.reward_coins); END IF;
        INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_diamonds,0), COALESCE(v_reward.reward_beans,0), now());
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward', '🏆 Leaderboard Reward!',
          'You ranked #' || v_rank || ' in ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Top Gifters!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- agency_performance
  IF p_category = 'agency_performance' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT ah.agency_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS stat_value
      FROM gift_transactions gt
      INNER JOIN agency_hosts ah ON ah.host_id = gt.receiver_id AND ah.status = 'active'
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      GROUP BY ah.agency_id
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config WHERE category = p_category AND period_type = p_period_type AND is_active = true AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        -- Agency rewards go to agency's beans_balance
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans WHERE id = v_entry.agency_id;
        END IF;
        INSERT INTO leaderboard_reward_history (agency_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
        VALUES (v_entry.agency_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_diamonds,0), COALESCE(v_reward.reward_beans,0), now());
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;
