-- Pkg376: PK competition reward ledger fix.
-- reward_diamonds must credit profiles.diamonds, reward_coins must credit profiles.coins,
-- reward_beans must credit profiles.beans. No beans_balance/coins cross-credit.

CREATE OR REPLACE FUNCTION public.distribute_pk_rewards(p_competition_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_comp record;
  v_count integer := 0;
  v_participant record;
  v_reward record;
  v_rank integer := 0;
  v_inserted boolean;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: admin or service role required';
  END IF;

  SELECT * INTO v_comp FROM public.pk_competitions WHERE id = p_competition_id;
  IF v_comp IS NULL OR v_comp.status = 'cancelled' THEN
    RETURN 0;
  END IF;

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
      AND v_rank >= rank_from AND v_rank <= rank_to
    LIMIT 1;

    IF v_reward IS NOT NULL THEN
      v_inserted := false;
      INSERT INTO public.pk_reward_history (competition_id, user_id, rank_position, reward_diamonds, reward_beans, reward_coins)
      VALUES (p_competition_id, v_participant.user_id, v_rank,
              COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0))
      ON CONFLICT (competition_id, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          PERFORM public.add_beans_to_user(v_participant.user_id, v_reward.reward_beans);
        END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN
          PERFORM public.add_diamonds_to_user(v_participant.user_id, v_reward.reward_diamonds);
        END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN
          PERFORM public.add_coins_to_user(v_participant.user_id, v_reward.reward_coins);
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
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_pk_rewards(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_pk_rewards(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.distribute_pk_rewards(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.distribute_pk_rewards(uuid) IS
'Pkg376: PK rewards credit exact ledgers through admin-aware helpers: reward_beans->profiles.beans, reward_diamonds->profiles.diamonds, reward_coins->profiles.coins.';
