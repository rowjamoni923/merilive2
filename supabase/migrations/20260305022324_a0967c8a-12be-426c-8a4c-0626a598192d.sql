
-- =============================================
-- FIX: Leaderboard rewards - once daily at 12:30 AM BST
-- 1. Fix idempotency (period_label format mismatch)
-- 2. Enforce currency: host_earnings→beans, top_gifters/game_winners→diamonds
-- 3. Use BST 12:30 AM boundaries (18:30 UTC)
-- =============================================

CREATE OR REPLACE FUNCTION public.distribute_period_rewards(p_category TEXT, p_period_type TEXT)
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
  v_bst_now TIMESTAMP;
  v_bst_today DATE;
  v_reward_amount INTEGER;
  v_currency_name TEXT;
BEGIN
  -- Calculate BST time (UTC+6)
  v_bst_now := (now() AT TIME ZONE 'Asia/Dhaka');
  
  -- If before 00:30 BST, we're still in "yesterday"
  IF v_bst_now::time < '00:30:00'::time THEN
    v_bst_today := (v_bst_now - interval '1 day')::date;
  ELSE
    v_bst_today := v_bst_now::date;
  END IF;

  IF p_period_type = 'daily' THEN
    -- Daily: previous day's 00:30 BST to today's 00:30 BST
    v_end_date := (v_bst_today::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := to_char(v_bst_today - interval '1 day', 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    -- Weekly: Monday 00:30 BST to next Monday 00:30 BST
    DECLARE v_dow INTEGER;
    BEGIN
      v_dow := EXTRACT(ISODOW FROM v_bst_today); -- 1=Mon
      v_end_date := ((v_bst_today - (v_dow - 1) * interval '1 day')::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
      v_start_date := v_end_date - interval '1 week';
      v_period_label := 'week-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD');
    END;
  ELSIF p_period_type = 'monthly' THEN
    -- Monthly: 1st 00:30 BST to next month 1st 00:30 BST
    v_end_date := (date_trunc('month', v_bst_today)::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'month-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM');
  ELSE
    RETURN 0;
  END IF;

  -- Idempotency check: use EXACT match on category + period_type + period_label
  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;

  IF v_already THEN RETURN 0; END IF;

  -- ===== HOST EARNINGS (Hosts/Female → BEANS ONLY) =====
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
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        -- ENFORCE: Host earnings = BEANS ONLY
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_beans(v_entry.user_id, v_reward_amount);
            
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, 0, 0, v_reward_amount, now());
            
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Rank #' || v_rank || '!',
              'Congratulations! You ranked #' || v_rank || ' in the ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Leaderboard and earned ' || v_reward_amount || ' Beans! 🎉',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_beans', v_reward_amount), false);
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Host reward error user=% rank=%: %', v_entry.user_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== GAME WINNERS (Users/Male → DIAMONDS ONLY) =====
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
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        -- ENFORCE: Game winners = DIAMONDS ONLY
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
            
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, v_reward_amount, 0, 0, now());
            
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Rank #' || v_rank || '!',
              'Congratulations! You ranked #' || v_rank || ' in the ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Leaderboard and earned ' || v_reward_amount || ' Diamonds! 💎',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Game reward error user=% rank=%: %', v_entry.user_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== TOP GIFTERS (Users/Male → DIAMONDS ONLY) =====
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
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        -- ENFORCE: Top gifters = DIAMONDS ONLY
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
            
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, v_reward_amount, 0, 0, now());
            
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Rank #' || v_rank || '!',
              'Congratulations! You ranked #' || v_rank || ' in the ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Leaderboard and earned ' || v_reward_amount || ' Diamonds! 💎',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Gifter reward error user=% rank=%: %', v_entry.user_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== AGENCY PERFORMANCE (Agencies → BEANS ONLY) =====
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
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + v_reward_amount WHERE id = v_entry.agency_id;
            
            INSERT INTO leaderboard_reward_history (agency_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.agency_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, 0, 0, v_reward_amount, now());
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Agency reward error agency=% rank=%: %', v_entry.agency_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- Recreate auto_distribute - simplified since cron now runs once daily
CREATE OR REPLACE FUNCTION public.auto_distribute_leaderboard_rewards()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results TEXT := '';
  v_count INTEGER;
  v_categories TEXT[] := ARRAY['host_earnings', 'game_winners', 'agency_performance', 'top_gifters'];
  v_cat TEXT;
  v_bst_now TIMESTAMP := (now() AT TIME ZONE 'Asia/Dhaka');
  v_bst_dow INTEGER := EXTRACT(ISODOW FROM v_bst_now); -- 1=Mon
  v_bst_day INTEGER := EXTRACT(DAY FROM v_bst_now);
BEGIN
  FOREACH v_cat IN ARRAY v_categories LOOP
    -- Daily: always distribute (idempotent)
    SELECT distribute_period_rewards(v_cat, 'daily') INTO v_count;
    IF v_count > 0 THEN
      v_results := v_results || v_cat || '/daily: ' || v_count || ' winners. ';
    END IF;

    -- Weekly: on Monday (ISODOW=1) in BST
    IF v_bst_dow = 1 THEN
      SELECT distribute_period_rewards(v_cat, 'weekly') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/weekly: ' || v_count || ' winners. ';
      END IF;
    END IF;

    -- Monthly: on 1st in BST
    IF v_bst_day = 1 THEN
      SELECT distribute_period_rewards(v_cat, 'monthly') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/monthly: ' || v_count || ' winners. ';
      END IF;
    END IF;
  END LOOP;

  IF v_results = '' THEN
    v_results := 'No distributions needed (BST DOW: ' || v_bst_dow || ', Day: ' || v_bst_day || ')';
  END IF;

  RETURN v_results;
END;
$$;
