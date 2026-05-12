-- Pkg32: 100% accurate Leaderboard reward distribution (daily 24h once, weekly 7d once)

-- 1) Extend leaderboard_reward_history to match distribution function expectations
ALTER TABLE public.leaderboard_reward_history
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS period_type TEXT,
  ADD COLUMN IF NOT EXISTS period_label TEXT,
  ADD COLUMN IF NOT EXISTS stat_value BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_coins BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_diamonds BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_beans BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS distributed_at TIMESTAMPTZ DEFAULT now();

-- 2) Hard guarantee: one reward per user per (category, period_type, period_label)
CREATE UNIQUE INDEX IF NOT EXISTS uq_leaderboard_reward_history_period_user
  ON public.leaderboard_reward_history (category, period_type, period_label, user_id)
  WHERE category IS NOT NULL AND period_type IS NOT NULL AND period_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lrh_period_lookup
  ON public.leaderboard_reward_history (category, period_type, period_label);

-- 3) Rewrite distribute_period_rewards: idempotent via UNIQUE + ON CONFLICT
CREATE OR REPLACE FUNCTION public.distribute_period_rewards(p_category TEXT, p_period_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date   TIMESTAMPTZ;
  v_period_label TEXT;
  v_count INTEGER := 0;
  v_reward RECORD;
  v_entry  RECORD;
  v_rank   INTEGER := 0;
  v_already BOOLEAN;
  v_bst_now TIMESTAMP;
  v_bst_today DATE;
  v_reward_amount BIGINT;
  v_inserted BOOLEAN;
BEGIN
  v_bst_now := (now() AT TIME ZONE 'Asia/Dhaka');
  -- Distribution window cuts at 00:30 BST every day
  IF v_bst_now::time < '00:30:00'::time THEN
    v_bst_today := (v_bst_now - interval '1 day')::date;
  ELSE
    v_bst_today := v_bst_now::date;
  END IF;

  IF p_period_type = 'daily' THEN
    v_end_date   := (v_bst_today::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := to_char(v_bst_today - interval '1 day', 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    DECLARE v_dow INTEGER;
    BEGIN
      v_dow := EXTRACT(ISODOW FROM v_bst_today);
      v_end_date := ((v_bst_today - (v_dow - 1) * interval '1 day')::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
      v_start_date := v_end_date - interval '1 week';
      v_period_label := 'week-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'IYYY-IW');
    END;
  ELSIF p_period_type = 'monthly' THEN
    v_end_date   := (date_trunc('month', v_bst_today)::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'month-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM');
  ELSE
    RETURN 0;
  END IF;

  -- Period-level guard: if ANY row exists for this exact period_label, skip whole loop
  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
     WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
     LIMIT 1
  ) INTO v_already;
  IF v_already THEN RETURN 0; END IF;

  -- HOST EARNINGS → BEANS
  IF p_category = 'host_earnings' THEN
    FOR v_entry IN (
      WITH gift_stats AS (
        SELECT gt.receiver_id AS user_id, SUM(FLOOR(gt.coin_amount * 0.6))::BIGINT AS total
        FROM gift_transactions gt
        INNER JOIN profiles p ON p.id = gt.receiver_id AND p.is_host = true
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
        GROUP BY gt.receiver_id
      ),
      call_stats AS (
        SELECT pc.host_id AS user_id, SUM(pc.host_earnings_amount)::BIGINT AS total
        FROM private_calls pc
        INNER JOIN profiles p ON p.id = pc.host_id AND p.is_host = true
        WHERE pc.created_at >= v_start_date AND pc.created_at < v_end_date AND pc.status = 'completed'
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT COALESCE(g.user_id, c.user_id) AS user_id,
               COALESCE(g.total,0) + COALESCE(c.total,0) AS stat_value
        FROM gift_stats g FULL OUTER JOIN call_stats c ON g.user_id = c.user_id
      )
      SELECT user_id, stat_value FROM combined
      WHERE user_id IS NOT NULL AND stat_value > 0
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
          AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans,0), COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_diamonds,0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      INSERT INTO leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_coins, reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              0, 0, v_reward_amount, now(), now(),
              p_category, 'beans', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF v_inserted THEN
        PERFORM _internal_add_beans(v_entry.user_id, v_reward_amount);
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Beans!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_beans', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- GAME WINNERS → DIAMONDS
  IF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.user_id, SUM(gt.amount)::BIGINT AS stat_value
      FROM game_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
        AND gt.transaction_type = 'win' AND gt.amount > 0
      GROUP BY gt.user_id ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
          AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds,0), COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_beans,0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      INSERT INTO leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_coins, reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              v_reward_amount, 0, 0, now(), now(),
              p_category, 'diamonds', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF v_inserted THEN
        PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- TOP GIFTERS → DIAMONDS
  IF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.sender_id AS user_id, SUM(gt.coin_amount)::BIGINT AS stat_value
      FROM gift_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      GROUP BY gt.sender_id ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
          AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds,0), COALESCE(v_reward.reward_coins,0), COALESCE(v_reward.reward_beans,0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      INSERT INTO leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_coins, reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              v_reward_amount, 0, 0, now(), now(),
              p_category, 'diamonds', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF v_inserted THEN
        PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- 4) Rewrite auto_distribute_leaderboard_rewards: dedupe by period_label (BST-correct), not UTC date_trunc
CREATE OR REPLACE FUNCTION public.auto_distribute_leaderboard_rewards()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_results TEXT := '';
  v_category RECORD;
  v_added INT;
BEGIN
  FOR v_category IN
    SELECT DISTINCT category, period_type
      FROM leaderboard_reward_config
     WHERE is_active = true
  LOOP
    -- distribute_period_rewards is itself idempotent (period_label guard + UNIQUE index)
    v_added := public.distribute_period_rewards(v_category.category, v_category.period_type);
    IF v_added > 0 THEN
      v_results := v_results || v_category.category || '/' || v_category.period_type
                || ' → ' || v_added || ' winners; ';
    END IF;
  END LOOP;
  IF v_results = '' THEN v_results := 'No new distributions'; END IF;
  RETURN v_results;
END;
$$;