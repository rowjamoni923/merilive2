-- Pkg313 deeper hardening: core leaderboard payout correctness

-- Lock down legacy host earning helper: it can change balances and levels, so it must not be user-callable.
CREATE OR REPLACE FUNCTION public.update_host_earnings_only(
  p_host_id uuid,
  p_beans_to_add bigint,
  p_new_total_earnings bigint,
  p_new_host_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: service role required';
  END IF;

  IF p_host_id IS NULL OR p_beans_to_add IS NULL OR p_beans_to_add < 0
     OR p_new_total_earnings IS NULL OR p_new_total_earnings < 0
     OR p_new_host_level IS NULL OR p_new_host_level < 1 THEN
    RAISE EXCEPTION 'Invalid host earnings update';
  END IF;

  SET LOCAL app.bypass_profile_protection = 'true';
  UPDATE public.profiles SET
    beans = COALESCE(beans, 0) + p_beans_to_add,
    total_earnings = p_new_total_earnings,
    host_level = p_new_host_level,
    weekly_earnings = COALESCE(weekly_earnings, 0) + p_beans_to_add
  WHERE id = p_host_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_host_earnings_only(uuid, bigint, bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_host_earnings_only(uuid, bigint, bigint, integer) TO service_role;

-- Align payout winners with the visible leaderboard RPCs and correct Diamond history fields.
CREATE OR REPLACE FUNCTION public.distribute_period_rewards(p_category text, p_period_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_period_label text;
  v_count integer := 0;
  v_reward record;
  v_entry record;
  v_rank integer := 0;
  v_already boolean;
  v_bst_now timestamp;
  v_bst_today date;
  v_reward_amount bigint;
  v_inserted boolean;
BEGIN
  IF p_category NOT IN ('host_earnings', 'game_winners', 'top_gifters') THEN
    RETURN 0;
  END IF;

  v_bst_now := (now() AT TIME ZONE 'Asia/Dhaka');
  IF v_bst_now::time < '00:30:00'::time THEN
    v_bst_today := (v_bst_now - interval '1 day')::date;
  ELSE
    v_bst_today := v_bst_now::date;
  END IF;

  IF p_period_type = 'daily' THEN
    v_end_date := (v_bst_today::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := to_char(v_bst_today - interval '1 day', 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    DECLARE v_dow integer;
    BEGIN
      v_dow := EXTRACT(ISODOW FROM v_bst_today);
      v_end_date := ((v_bst_today - (v_dow - 1) * interval '1 day')::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
      v_start_date := v_end_date - interval '1 week';
      v_period_label := 'week-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'IYYY-IW');
    END;
  ELSIF p_period_type = 'monthly' THEN
    v_end_date := (date_trunc('month', v_bst_today)::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'month-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM');
  ELSE
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;
  IF v_already THEN RETURN 0; END IF;

  IF p_category = 'host_earnings' THEN
    FOR v_entry IN (
      WITH gift_earn AS (
        SELECT gt.receiver_id AS uid, COALESCE(SUM(gt.receiver_beans), 0)::bigint AS amt
        FROM public.gift_transactions gt
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date AND gt.receiver_id IS NOT NULL
        GROUP BY gt.receiver_id
      ),
      call_earn AS (
        SELECT pc.host_id AS uid, COALESCE(SUM(COALESCE(pc.host_earnings_amount, pc.host_earned, 0)), 0)::bigint AS amt
        FROM public.private_calls pc
        WHERE pc.ended_at >= v_start_date AND pc.ended_at < v_end_date AND pc.host_id IS NOT NULL
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT uid, SUM(amt)::bigint AS total
        FROM (SELECT uid, amt FROM gift_earn UNION ALL SELECT uid, amt FROM call_earn) s
        GROUP BY uid HAVING SUM(amt) > 0
      )
      SELECT p.id AS user_id, c.total AS stat_value
      FROM combined c
      JOIN public.profiles p ON p.id = c.uid
      WHERE p.is_host = true AND LOWER(COALESCE(p.gender, '')) = 'female'
      ORDER BY c.total DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      v_inserted := false;
      INSERT INTO public.leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_coins, reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              0, 0, v_reward_amount, now(), now(),
              p_category, 'beans', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        PERFORM public._internal_add_beans(v_entry.user_id, v_reward_amount::integer);
        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Beans!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_beans', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gb.player_id AS user_id, COALESCE(SUM(gb.payout), 0)::bigint AS stat_value
      FROM public.game_bets gb
      WHERE gb.created_at >= v_start_date AND gb.created_at < v_end_date
        AND gb.player_id IS NOT NULL AND COALESCE(gb.payout, 0) > 0
      GROUP BY gb.player_id
      HAVING COALESCE(SUM(gb.payout), 0) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      v_inserted := false;
      INSERT INTO public.leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_coins, reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              0, v_reward_amount, 0, now(), now(),
              p_category, 'diamonds', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        PERFORM public._internal_add_coins(v_entry.user_id, v_reward_amount::integer);
        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      WITH gift_spend AS (
        SELECT gt.sender_id AS uid, COALESCE(SUM(gt.coin_cost), 0)::bigint AS amt
        FROM public.gift_transactions gt
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date AND gt.sender_id IS NOT NULL
        GROUP BY gt.sender_id
      ),
      call_spend AS (
        SELECT pc.caller_id AS uid, COALESCE(SUM(COALESCE(pc.total_coins_deducted, pc.coins_spent, 0)), 0)::bigint AS amt
        FROM public.private_calls pc
        WHERE pc.ended_at >= v_start_date AND pc.ended_at < v_end_date AND pc.caller_id IS NOT NULL
        GROUP BY pc.caller_id
      ),
      game_spend AS (
        SELECT gb.player_id AS uid, COALESCE(SUM(gb.bet_amount), 0)::bigint AS amt
        FROM public.game_bets gb
        WHERE gb.created_at >= v_start_date AND gb.created_at < v_end_date AND gb.player_id IS NOT NULL
        GROUP BY gb.player_id
      ),
      combined AS (
        SELECT uid, SUM(amt)::bigint AS total
        FROM (SELECT uid, amt FROM gift_spend UNION ALL SELECT uid, amt FROM call_spend UNION ALL SELECT uid, amt FROM game_spend) s
        GROUP BY uid HAVING SUM(amt) > 0
      )
      SELECT p.id AS user_id, c.total AS stat_value
      FROM combined c
      JOIN public.profiles p ON p.id = c.uid
      WHERE LOWER(COALESCE(p.gender, '')) = 'male'
      ORDER BY c.total DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      v_inserted := false;
      INSERT INTO public.leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_coins, reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              0, v_reward_amount, 0, now(), now(),
              p_category, 'diamonds', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        PERFORM public._internal_add_coins(v_entry.user_id, v_reward_amount::integer);
        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
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

REVOKE ALL ON FUNCTION public.distribute_period_rewards(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_period_rewards(text, text) TO service_role;

-- Keep master distributor backend-only while preserving database cron/owner execution.
REVOKE ALL ON FUNCTION public.auto_distribute_leaderboard_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_distribute_leaderboard_rewards() TO service_role;