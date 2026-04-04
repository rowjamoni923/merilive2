
-- ===================================
-- 1. RPC: add_diamonds_to_user (atomic)
-- ===================================
CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id UUID, _amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET coins = coins + _amount
  WHERE id = _user_id;
END;
$$;

-- ===================================
-- 2. RPC: add_beans_to_user (atomic)
-- ===================================
CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id UUID, _amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET beans_balance = COALESCE(beans_balance, 0) + _amount
  WHERE id = _user_id;
END;
$$;

-- ===================================
-- 3. Leaderboard auto-distribution function
-- ===================================
CREATE OR REPLACE FUNCTION public.distribute_period_rewards(
  p_category TEXT,
  p_period_type TEXT
)
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
    -- Previous week (Mon-Sun)
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

  -- Process based on category
  IF p_category = 'host_earnings' THEN
    -- Calculate host earnings rankings
    FOR v_entry IN (
      SELECT
        COALESCE(g.receiver_id, c.host_id) AS user_id,
        COALESCE(SUM(g.beans_sum), 0) + COALESCE(SUM(c.call_sum), 0) AS stat_value
      FROM (
        SELECT receiver_id, SUM(beans_amount) AS beans_sum
        FROM gift_transaction_logs
        WHERE created_at >= v_start_date AND created_at < v_end_date AND status = 'completed'
        GROUP BY receiver_id
      ) g
      FULL OUTER JOIN (
        SELECT host_id, SUM(host_earnings_amount) AS call_sum
        FROM private_calls
        WHERE created_at >= v_start_date AND created_at < v_end_date AND status = 'completed'
        GROUP BY host_id
      ) c ON g.receiver_id = c.host_id
      WHERE COALESCE(g.receiver_id, c.host_id) IS NOT NULL
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      
      -- Find matching reward tier
      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category
      AND period_type = p_period_type
      AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        -- Credit beans
        IF v_reward.reward_beans > 0 THEN
          UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans WHERE id = v_entry.user_id;
        END IF;
        -- Credit diamonds (coins)
        IF v_reward.reward_diamonds > 0 THEN
          UPDATE profiles SET coins = coins + v_reward.reward_diamonds WHERE id = v_entry.user_id;
        END IF;
        -- Credit coins
        IF v_reward.reward_coins > 0 THEN
          UPDATE profiles SET coins = coins + v_reward.reward_coins WHERE id = v_entry.user_id;
        END IF;

        -- Record history
        INSERT INTO leaderboard_reward_history (
          user_id, category, period_type, period_label, rank_position,
          stat_value, reward_coins, reward_diamonds, reward_beans
        ) VALUES (
          v_entry.user_id, p_category, p_period_type, v_period_label, v_rank,
          v_entry.stat_value, COALESCE(v_reward.reward_coins, 0),
          COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0)
        );

        -- Send notification
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id,
          'reward',
          '🏆 Leaderboard Reward!',
          'Congratulations! You ranked #' || v_rank || ' in ' || 
          CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END ||
          ' Host Earnings and earned rewards!',
          jsonb_build_object(
            'category', p_category,
            'period_type', p_period_type,
            'rank', v_rank,
            'reward_beans', COALESCE(v_reward.reward_beans, 0),
            'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)
          ),
          false
        );

        v_count := v_count + 1;
      END IF;
    END LOOP;

  ELSIF p_category = 'game_winners' THEN
    v_rank := 0;
    -- Calculate game winners rankings
    FOR v_entry IN (
      SELECT user_id, SUM(amount) AS stat_value
      FROM game_transactions
      WHERE created_at >= v_start_date AND created_at < v_end_date
      AND (transaction_type = 'win' OR transaction_type = 'jackpot')
      GROUP BY user_id
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      
      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category
      AND period_type = p_period_type
      AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        IF v_reward.reward_diamonds > 0 THEN
          UPDATE profiles SET coins = coins + v_reward.reward_diamonds WHERE id = v_entry.user_id;
        END IF;
        IF v_reward.reward_beans > 0 THEN
          UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans WHERE id = v_entry.user_id;
        END IF;
        IF v_reward.reward_coins > 0 THEN
          UPDATE profiles SET coins = coins + v_reward.reward_coins WHERE id = v_entry.user_id;
        END IF;

        INSERT INTO leaderboard_reward_history (
          user_id, category, period_type, period_label, rank_position,
          stat_value, reward_coins, reward_diamonds, reward_beans
        ) VALUES (
          v_entry.user_id, p_category, p_period_type, v_period_label, v_rank,
          v_entry.stat_value, COALESCE(v_reward.reward_coins, 0),
          COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0)
        );

        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id,
          'reward',
          '🏆 Leaderboard Reward!',
          'Congratulations! You ranked #' || v_rank || ' in ' || 
          CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END ||
          ' Game Rankings and earned rewards!',
          jsonb_build_object(
            'category', p_category,
            'period_type', p_period_type,
            'rank', v_rank,
            'reward_beans', COALESCE(v_reward.reward_beans, 0),
            'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)
          ),
          false
        );

        v_count := v_count + 1;
      END IF;
    END LOOP;

  ELSIF p_category = 'agency_performance' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT a.id AS agency_id, a.owner_id,
        COALESCE(SUM(ah_data.earnings), 0) AS stat_value
      FROM agencies a
      LEFT JOIN (
        SELECT ah.agency_id, SUM(
          COALESCE(g.beans_sum, 0) + COALESCE(c.call_sum, 0)
        ) AS earnings
        FROM agency_hosts ah
        LEFT JOIN (
          SELECT receiver_id, SUM(beans_amount) AS beans_sum
          FROM gift_transaction_logs
          WHERE created_at >= v_start_date AND created_at < v_end_date AND status = 'completed'
          GROUP BY receiver_id
        ) g ON g.receiver_id = ah.host_id
        LEFT JOIN (
          SELECT host_id, SUM(host_earnings_amount) AS call_sum
          FROM private_calls
          WHERE created_at >= v_start_date AND created_at < v_end_date AND status = 'completed'
          GROUP BY host_id
        ) c ON c.host_id = ah.host_id
        WHERE ah.status = 'active'
        GROUP BY ah.agency_id
      ) ah_data ON ah_data.agency_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id, a.owner_id
      HAVING COALESCE(SUM(ah_data.earnings), 0) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;

      SELECT * INTO v_reward FROM leaderboard_reward_config
      WHERE category = p_category
      AND period_type = p_period_type
      AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        IF v_reward.reward_diamonds > 0 THEN
          UPDATE agencies SET diamond_balance = diamond_balance + v_reward.reward_diamonds WHERE id = v_entry.agency_id;
        END IF;

        INSERT INTO leaderboard_reward_history (
          agency_id, category, period_type, period_label, rank_position,
          stat_value, reward_coins, reward_diamonds, reward_beans
        ) VALUES (
          v_entry.agency_id, p_category, p_period_type, v_period_label, v_rank,
          v_entry.stat_value, COALESCE(v_reward.reward_coins, 0),
          COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0)
        );

        -- Notify agency owner
        IF v_entry.owner_id IS NOT NULL THEN
          INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
            v_entry.owner_id,
            'reward',
            '🏆 Agency Leaderboard Reward!',
            'Your agency ranked #' || v_rank || ' in ' || 
            CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END ||
            ' rankings! ' || COALESCE(v_reward.reward_diamonds, 0) || ' Diamonds credited.',
            jsonb_build_object(
              'category', p_category,
              'period_type', p_period_type,
              'rank', v_rank,
              'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0)
            ),
            false
          );
        END IF;

        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- ===================================
-- 4. Master auto-distribute function (calls all categories/periods)
-- ===================================
CREATE OR REPLACE FUNCTION public.auto_distribute_leaderboard_rewards()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
  v_result INTEGER;
  v_now TIMESTAMPTZ := now();
  v_hour INTEGER := EXTRACT(HOUR FROM v_now);
  v_dow INTEGER := EXTRACT(DOW FROM v_now); -- 0=Sun, 1=Mon
  v_dom INTEGER := EXTRACT(DAY FROM v_now);
BEGIN
  -- Daily rewards: distribute at midnight (hour 0) for previous day
  IF v_hour = 0 THEN
    SELECT distribute_period_rewards('host_earnings', 'daily') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
    SELECT distribute_period_rewards('game_winners', 'daily') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
  END IF;

  -- Weekly rewards: distribute on Monday (dow=1) at midnight
  IF v_hour = 0 AND v_dow = 1 THEN
    SELECT distribute_period_rewards('host_earnings', 'weekly') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
    SELECT distribute_period_rewards('game_winners', 'weekly') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
    SELECT distribute_period_rewards('agency_performance', 'weekly') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
  END IF;

  -- Monthly rewards: distribute on 1st of month at midnight
  IF v_hour = 0 AND v_dom = 1 THEN
    SELECT distribute_period_rewards('host_earnings', 'monthly') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
    SELECT distribute_period_rewards('game_winners', 'monthly') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
    SELECT distribute_period_rewards('agency_performance', 'monthly') INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
  END IF;

  RETURN 'Distributed to ' || v_total || ' winners';
END;
$$;

-- ===================================
-- 5. Schedule with pg_cron (runs every hour at minute 0)
-- ===================================
SELECT cron.schedule(
  'auto-distribute-leaderboard-rewards',
  '0 * * * *',
  $$SELECT public.auto_distribute_leaderboard_rewards()$$
);
