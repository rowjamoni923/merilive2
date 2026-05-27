-- Pkg375: Final hardening for the audited admin balance/reward section.
-- Fixes legacy leaderboard reward paths so reward_diamonds credits profiles.diamonds,
-- reward_coins credits profiles.coins, and reward_beans credits profiles.beans.

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
BEGIN
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

  SELECT EXISTS (
    SELECT 1
    FROM public.leaderboard_reward_history
    WHERE category = p_category
      AND period_type = p_period_type
      AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;

  IF v_already THEN
    RETURN 0;
  END IF;

  IF p_category = 'host_earnings' THEN
    FOR v_entry IN (
      WITH gift_stats AS (
        SELECT gt.receiver_id AS user_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS stat_value
        FROM public.gift_transactions gt
        INNER JOIN public.profiles p ON p.id = gt.receiver_id AND p.is_host = true
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
        GROUP BY gt.receiver_id
      ),
      call_stats AS (
        SELECT pc.host_id AS user_id, SUM(pc.host_earnings_amount) AS stat_value
        FROM public.private_calls pc
        INNER JOIN public.profiles p ON p.id = pc.host_id AND p.is_host = true
        WHERE pc.created_at >= v_start_date AND pc.created_at < v_end_date AND pc.status = 'completed'
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT COALESCE(g.user_id, c.user_id) AS user_id,
               COALESCE(g.stat_value, 0) + COALESCE(c.stat_value, 0) AS stat_value
        FROM gift_stats g
        FULL OUTER JOIN call_stats c ON c.user_id = g.user_id
      )
      SELECT user_id, stat_value FROM combined
      WHERE user_id IS NOT NULL AND stat_value > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          PERFORM public.add_beans_to_user(v_entry.user_id, v_reward.reward_beans);
        END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN
          PERFORM public.add_diamonds_to_user(v_entry.user_id, v_reward.reward_diamonds);
        END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN
          PERFORM public.add_coins_to_user(v_entry.user_id, v_reward.reward_coins);
        END IF;

        INSERT INTO public.leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
                COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));
        v_count := v_count + 1;
      END IF;
    END LOOP;

  ELSIF p_category = 'game_winners' THEN
    FOR v_entry IN (
      SELECT user_id, COUNT(*) AS stat_value
      FROM public.game_transactions
      WHERE created_at >= v_start_date AND created_at < v_end_date
      GROUP BY user_id
      HAVING COUNT(*) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          PERFORM public.add_beans_to_user(v_entry.user_id, v_reward.reward_beans);
        END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN
          PERFORM public.add_diamonds_to_user(v_entry.user_id, v_reward.reward_diamonds);
        END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN
          PERFORM public.add_coins_to_user(v_entry.user_id, v_reward.reward_coins);
        END IF;

        INSERT INTO public.leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
                COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));
        v_count := v_count + 1;
      END IF;
    END LOOP;

  ELSIF p_category = 'top_gifters' THEN
    FOR v_entry IN (
      SELECT sender_id AS user_id, SUM(coin_amount) AS stat_value
      FROM public.gift_transactions
      WHERE created_at >= v_start_date AND created_at < v_end_date
        AND sender_id IS NOT NULL
      GROUP BY sender_id
      HAVING SUM(coin_amount) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          PERFORM public.add_beans_to_user(v_entry.user_id, v_reward.reward_beans);
        END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN
          PERFORM public.add_diamonds_to_user(v_entry.user_id, v_reward.reward_diamonds);
        END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN
          PERFORM public.add_coins_to_user(v_entry.user_id, v_reward.reward_coins);
        END IF;

        INSERT INTO public.leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
                COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));
        v_count := v_count + 1;
      END IF;
    END LOOP;

  ELSIF p_category = 'agency_performance' THEN
    FOR v_entry IN (
      WITH host_earnings AS (
        SELECT ah.agency_id, ah.host_id,
          COALESCE((SELECT SUM(FLOOR(coin_amount * 0.6)) FROM public.gift_transactions WHERE receiver_id = ah.host_id AND created_at >= v_start_date AND created_at < v_end_date), 0) +
          COALESCE((SELECT SUM(host_earnings_amount) FROM public.private_calls WHERE host_id = ah.host_id AND created_at >= v_start_date AND created_at < v_end_date AND status = 'completed'), 0) AS earnings
        FROM public.agency_hosts ah WHERE ah.status = 'active'
      )
      SELECT a.id AS agency_id, a.owner_id, COALESCE(SUM(he.earnings), 0) AS stat_value
      FROM public.agencies a
      LEFT JOIN host_earnings he ON he.agency_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id, a.owner_id
      HAVING COALESCE(SUM(he.earnings), 0) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to
      LIMIT 1;

      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          PERFORM set_config('app.bypass_agency_economy_guard','true',true);
          UPDATE public.agencies
             SET beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans,
                 updated_at = now()
           WHERE id = v_entry.agency_id;
          PERFORM set_config('app.bypass_agency_economy_guard','false',true);
        END IF;

        INSERT INTO public.leaderboard_reward_history (agency_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans)
        VALUES (v_entry.agency_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
                0, 0, COALESCE(v_reward.reward_beans, 0));
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_period_rewards(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_period_rewards(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.distribute_period_rewards(text, text) IS
'Pkg375: leaderboard rewards credit exact ledgers: reward_coins->profiles.coins, reward_diamonds->profiles.diamonds, reward_beans->profiles.beans; agency beans use agency economy bypass.';
