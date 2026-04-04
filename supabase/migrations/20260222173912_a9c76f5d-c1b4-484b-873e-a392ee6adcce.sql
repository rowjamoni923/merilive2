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
  -- Calculate period dates
  IF p_period_type = 'daily' THEN
    v_start_date := date_trunc('day', now() - interval '1 day');
    v_end_date := date_trunc('day', now());
    v_period_label := 'daily_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    v_start_date := date_trunc('week', now() - interval '1 week');
    v_end_date := date_trunc('week', now());
    v_period_label := 'weekly_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'monthly' THEN
    v_start_date := date_trunc('month', now() - interval '1 month');
    v_end_date := date_trunc('month', now());
    v_period_label := 'monthly_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSE
    RETURN 0;
  END IF;

  -- Check if already distributed
  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category
    AND period_type = p_period_type
    AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;

  IF v_already THEN
    RETURN 0;
  END IF;

  -- Process host_earnings category
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
        FROM gift_stats g
        FULL OUTER JOIN call_stats c ON g.user_id = c.user_id
      )
      SELECT user_id, stat_value FROM combined
      WHERE user_id IS NOT NULL AND stat_value > 0
      -- Exclude demo accounts
      AND user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9', 'ab155d31-96d4-4a42-855d-b2c090ba0339', '251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      
      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

      IF v_reward IS NOT NULL THEN
        -- Check min_target threshold
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN
          CONTINUE;
        END IF;

        IF v_reward.reward_beans > 0 THEN
          PERFORM add_beans_to_user(v_entry.user_id, v_reward.reward_beans);
        END IF;
        IF v_reward.reward_diamonds > 0 THEN
          PERFORM add_diamonds_to_user(v_entry.user_id, v_reward.reward_diamonds);
        END IF;
        IF v_reward.reward_coins > 0 THEN
          PERFORM add_coins_to_user(v_entry.user_id, v_reward.reward_coins);
        END IF;

        INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));

        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward', '🏆 Leaderboard Reward!',
          'Congratulations! You ranked #' || v_rank || ' in ' || 
          CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END ||
          ' Host Earnings! Rewards: ' ||
          CASE WHEN COALESCE(v_reward.reward_beans, 0) > 0 THEN v_reward.reward_beans || ' Beans ' ELSE '' END ||
          CASE WHEN COALESCE(v_reward.reward_diamonds, 0) > 0 THEN v_reward.reward_diamonds || ' Diamonds ' ELSE '' END ||
          CASE WHEN COALESCE(v_reward.reward_coins, 0) > 0 THEN v_reward.reward_coins || ' Coins' ELSE '' END,
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank,
            'reward_beans', COALESCE(v_reward.reward_beans, 0), 'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)), false);

        v_count := v_count + 1;
      END IF;
    END LOOP;

  -- Process game_winners category
  ELSIF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT user_id, COUNT(*) AS stat_value
      FROM game_transactions
      WHERE created_at >= v_start_date AND created_at < v_end_date
      GROUP BY user_id
      HAVING COUNT(*) > 0
      -- Exclude demo accounts
      AND user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9', 'ab155d31-96d4-4a42-855d-b2c090ba0339', '251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      
      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

      IF v_reward IS NOT NULL THEN
        -- Check min_target threshold
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN
          CONTINUE;
        END IF;

        IF v_reward.reward_beans > 0 THEN
          PERFORM add_beans_to_user(v_entry.user_id, v_reward.reward_beans);
        END IF;
        IF v_reward.reward_diamonds > 0 THEN
          PERFORM add_diamonds_to_user(v_entry.user_id, v_reward.reward_diamonds);
        END IF;
        IF v_reward.reward_coins > 0 THEN
          PERFORM add_coins_to_user(v_entry.user_id, v_reward.reward_coins);
        END IF;

        INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));

        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward', '🏆 Leaderboard Reward!',
          'Congratulations! You ranked #' || v_rank || ' in ' ||
          CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END ||
          ' Game! Rewards: ' ||
          CASE WHEN COALESCE(v_reward.reward_beans, 0) > 0 THEN v_reward.reward_beans || ' Beans ' ELSE '' END ||
          CASE WHEN COALESCE(v_reward.reward_diamonds, 0) > 0 THEN v_reward.reward_diamonds || ' Diamonds ' ELSE '' END ||
          CASE WHEN COALESCE(v_reward.reward_coins, 0) > 0 THEN v_reward.reward_coins || ' Coins' ELSE '' END,
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank,
            'reward_beans', COALESCE(v_reward.reward_beans, 0), 'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)), false);

        v_count := v_count + 1;
      END IF;
    END LOOP;

  -- Process agency_performance category
  ELSIF p_category = 'agency_performance' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT a.id AS agency_id, a.name,
             COALESCE(SUM(FLOOR(gt.coin_amount * 0.6)), 0) AS stat_value
      FROM agencies a
      INNER JOIN agency_hosts ah ON ah.agency_id = a.id AND ah.status = 'active'
      LEFT JOIN gift_transactions gt ON gt.receiver_id = ah.host_id 
        AND gt.created_at >= v_start_date AND gt.created_at < v_end_date
      WHERE a.is_active = true
      GROUP BY a.id, a.name
      HAVING COALESCE(SUM(FLOOR(gt.coin_amount * 0.6)), 0) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      
      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

      IF v_reward IS NOT NULL THEN
        -- Check min_target threshold
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN
          CONTINUE;
        END IF;

        IF v_reward.reward_beans > 0 THEN
          UPDATE agencies SET beans_balance = beans_balance + v_reward.reward_beans WHERE id = v_entry.agency_id;
        END IF;
        IF v_reward.reward_diamonds > 0 THEN
          UPDATE agencies SET diamond_balance = diamond_balance + v_reward.reward_diamonds WHERE id = v_entry.agency_id;
        END IF;

        INSERT INTO leaderboard_reward_history (agency_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.agency_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));

        v_count := v_count + 1;
      END IF;
    END LOOP;

  -- Process top_gifters category
  ELSIF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.sender_id AS user_id, SUM(gt.coin_amount) AS stat_value
      FROM gift_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      -- Exclude demo accounts
      AND gt.sender_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9', 'ab155d31-96d4-4a42-855d-b2c090ba0339', '251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      GROUP BY gt.sender_id
      HAVING SUM(gt.coin_amount) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      
      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

      IF v_reward IS NOT NULL THEN
        -- Check min_target threshold
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN
          CONTINUE;
        END IF;

        IF v_reward.reward_beans > 0 THEN
          PERFORM add_beans_to_user(v_entry.user_id, v_reward.reward_beans);
        END IF;
        IF v_reward.reward_diamonds > 0 THEN
          PERFORM add_diamonds_to_user(v_entry.user_id, v_reward.reward_diamonds);
        END IF;
        IF v_reward.reward_coins > 0 THEN
          PERFORM add_coins_to_user(v_entry.user_id, v_reward.reward_coins);
        END IF;

        INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));

        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward', '🏆 Leaderboard Reward!',
          'Congratulations! You ranked #' || v_rank || ' in ' ||
          CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END ||
          ' Top Gifter! Rewards: ' ||
          CASE WHEN COALESCE(v_reward.reward_beans, 0) > 0 THEN v_reward.reward_beans || ' Beans ' ELSE '' END ||
          CASE WHEN COALESCE(v_reward.reward_diamonds, 0) > 0 THEN v_reward.reward_diamonds || ' Diamonds ' ELSE '' END ||
          CASE WHEN COALESCE(v_reward.reward_coins, 0) > 0 THEN v_reward.reward_coins || ' Coins' ELSE '' END,
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank,
            'reward_beans', COALESCE(v_reward.reward_beans, 0), 'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)), false);

        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;