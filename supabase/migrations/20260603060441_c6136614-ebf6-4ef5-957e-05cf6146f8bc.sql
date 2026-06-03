-- Pkg346 Tasks/Bonuses/Leaderboards deep audit lockdown
-- Section #5 of Admin Panel A→Z roadmap (Pkg342-350).
-- -----------------------------------------------------------
-- (A) RPC section-permission gates
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_host_bonus_settings(
  _beans_per_hour integer, _max_hours_per_day integer, _eligible_days integer,
  _target_minutes integer, _daily_reset_offset_minutes integer, _is_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['new-host-bonus','host-management','streams','daily-tasks']::text[], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden_section');
  END IF;

  IF _beans_per_hour IS NULL OR _beans_per_hour < 0
     OR _max_hours_per_day IS NULL OR _max_hours_per_day < 1
     OR _eligible_days IS NULL OR _eligible_days < 1
     OR _target_minutes IS NULL OR _target_minutes < 1
     OR _daily_reset_offset_minutes IS NULL OR _daily_reset_offset_minutes < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  INSERT INTO public.new_host_live_bonus_settings
    (hour_number, day_number, bonus_beans, bonus_amount, beans_per_hour,
     max_hours_per_day, eligible_days, eligible_program_days,
     target_minutes, daily_reset_offset_minutes, is_active)
  SELECT g, 1, _beans_per_hour, _beans_per_hour, _beans_per_hour,
         _max_hours_per_day, _eligible_days, _eligible_days,
         _target_minutes, _daily_reset_offset_minutes, _is_active
  FROM generate_series(1, _max_hours_per_day) g
  ON CONFLICT (hour_number) DO UPDATE SET
    bonus_beans = EXCLUDED.bonus_beans,
    bonus_amount = EXCLUDED.bonus_amount,
    beans_per_hour = EXCLUDED.beans_per_hour,
    max_hours_per_day = EXCLUDED.max_hours_per_day,
    eligible_days = EXCLUDED.eligible_days,
    eligible_program_days = EXCLUDED.eligible_program_days,
    target_minutes = EXCLUDED.target_minutes,
    daily_reset_offset_minutes = EXCLUDED.daily_reset_offset_minutes,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  DELETE FROM public.new_host_live_bonus_settings
  WHERE hour_number > _max_hours_per_day OR hour_number < 1;

  RETURN jsonb_build_object('success', true, 'hours', _max_hours_per_day);
END;$fn$;

GRANT EXECUTE ON FUNCTION public.admin_save_host_bonus_settings(integer,integer,integer,integer,integer,boolean) TO anon, authenticated, service_role;

-- distribute_pk_rewards: add section gate (service_role bypass preserved)
CREATE OR REPLACE FUNCTION public.distribute_pk_rewards(p_competition_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_comp record;
  v_count integer := 0;
  v_participant record;
  v_reward record;
  v_rank integer := 0;
  v_inserted boolean;
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NOT v_is_service THEN
    IF NOT public.is_active_admin_session() THEN
      RAISE EXCEPTION 'Unauthorized: admin or service role required';
    END IF;
    IF NOT public.admin_has_any_section_permission(
      ARRAY['leaderboard','streams','moderation']::text[], true) THEN
      RAISE EXCEPTION 'forbidden_section';
    END IF;
  END IF;

  SELECT * INTO v_comp FROM public.pk_competitions WHERE id = p_competition_id;
  IF v_comp IS NULL OR v_comp.status = 'cancelled' THEN RETURN 0; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.pk_participants_internal', 'true', true);

  FOR v_participant IN (
    SELECT * FROM public.pk_participants
    WHERE competition_id = p_competition_id AND score > 0
    ORDER BY score DESC, updated_at ASC
    LIMIT 50
  ) LOOP
    v_rank := v_rank + 1;
    UPDATE public.pk_participants SET rank_position = v_rank WHERE id = v_participant.id;

    SELECT * INTO v_reward FROM public.pk_competition_rewards
    WHERE competition_id = p_competition_id AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

    IF v_reward IS NOT NULL THEN
      v_inserted := false;
      INSERT INTO public.pk_reward_history (competition_id, user_id, rank_position, reward_diamonds, reward_beans, reward_coins)
      VALUES (p_competition_id, v_participant.user_id, v_rank,
              COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0))
      ON CONFLICT (competition_id, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          UPDATE public.profiles
          SET beans = COALESCE(beans, 0) + v_reward.reward_beans,
              beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans
          WHERE id = v_participant.user_id;
        END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN
          UPDATE public.profiles SET coins = COALESCE(coins, 0) + v_reward.reward_diamonds WHERE id = v_participant.user_id;
        END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN
          UPDATE public.profiles SET coins = COALESCE(coins, 0) + v_reward.reward_coins WHERE id = v_participant.user_id;
        END IF;

        UPDATE public.pk_participants SET reward_distributed = true WHERE id = v_participant.id;

        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_participant.user_id, 'reward', '🏆 PK Competition Reward!',
          'Congratulations! You ranked #' || v_rank || ' in "' || v_comp.title || '"!',
          jsonb_build_object('type', 'pk_reward', 'competition_id', p_competition_id, 'rank', v_rank,
            'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0), 'reward_beans', COALESCE(v_reward.reward_beans, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)),
          false
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_comp.status <> 'ended' THEN
    UPDATE public.pk_competitions SET status = 'ended' WHERE id = p_competition_id;
  END IF;

  RETURN v_count;
END;$fn$;

GRANT EXECUTE ON FUNCTION public.distribute_pk_rewards(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------
-- (B) Defense-in-depth REVOKE anon on user-self-binding RPCs
-- -----------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.claim_daily_login_reward(date, timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(date, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_parcel_reward(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_parcel_reward(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------
-- (C) Drop "Admin session full access" catch-all
-- -----------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        'agency_performance','agency_rankings',
        'daily_login_claims','daily_login_rewards_config','daily_tasks',
        'invitation_reward_claims','invitation_reward_tiers',
        'leaderboard_reward_config','leaderboard_reward_history',
        'ranking_rewards','rating_reward_audit_log','rating_reward_claims',
        'registration_bonus_claims','user_login_streaks','user_task_progress',
        'welcome_bonuses'
      )
      AND policyname IN ('Admin session full access','rrc_admin_all')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END$$;

-- -----------------------------------------------------------
-- (D) Audit/log tables — SELECT-only for any active admin
-- -----------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'agency_performance','agency_rankings',
    'daily_login_claims','user_login_streaks','user_task_progress',
    'invitation_reward_claims','leaderboard_reward_history',
    'rating_reward_audit_log','rating_reward_claims',
    'registration_bonus_claims'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY pkg346_%I_admin_select ON public.%I FOR SELECT TO anon, authenticated USING (public.is_active_admin_session())',
      t, t);
  END LOOP;
END$$;

-- rating_reward_claims keeps its rrc_select_own (Pkg363) for user-self view.

-- -----------------------------------------------------------
-- (E) Catalog/config tables — SELECT any admin + WRITE section-gated
-- -----------------------------------------------------------
-- daily_tasks → daily-tasks/leaderboard
CREATE POLICY pkg346_daily_tasks_admin_select ON public.daily_tasks
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg346_daily_tasks_admin_write ON public.daily_tasks
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['daily-tasks','leaderboard']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['daily-tasks','leaderboard']::text[], true));

-- daily_login_rewards_config → daily-login-rewards/daily-tasks
CREATE POLICY pkg346_daily_login_rewards_config_admin_select ON public.daily_login_rewards_config
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg346_daily_login_rewards_config_admin_write ON public.daily_login_rewards_config
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['daily-login-rewards','daily-tasks','leaderboard']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['daily-login-rewards','daily-tasks','leaderboard']::text[], true));

-- leaderboard_reward_config → leaderboard
CREATE POLICY pkg346_leaderboard_reward_config_admin_select ON public.leaderboard_reward_config
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg346_leaderboard_reward_config_admin_write ON public.leaderboard_reward_config
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks']::text[], true));

-- ranking_rewards → leaderboard
CREATE POLICY pkg346_ranking_rewards_admin_select ON public.ranking_rewards
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg346_ranking_rewards_admin_write ON public.ranking_rewards
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['leaderboard']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['leaderboard']::text[], true));

-- invitation_reward_tiers → leaderboard (no dedicated invitations section)
CREATE POLICY pkg346_invitation_reward_tiers_admin_select ON public.invitation_reward_tiers
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg346_invitation_reward_tiers_admin_write ON public.invitation_reward_tiers
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks']::text[], true));

-- welcome_bonuses → daily-login-rewards/leaderboard
CREATE POLICY pkg346_welcome_bonuses_admin_select ON public.welcome_bonuses
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg346_welcome_bonuses_admin_write ON public.welcome_bonuses
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['daily-login-rewards','leaderboard','daily-tasks']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['daily-login-rewards','leaderboard','daily-tasks']::text[], true));