-- Pkg313 final pass: PK leaderboard write guards and reward distributor repair

-- Prevent client-side fake score/rank/reward state on pk_participants.
CREATE OR REPLACE FUNCTION public.guard_pk_participants_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_internal boolean := COALESCE(current_setting('app.pk_participants_internal', true), '') = 'true';
  v_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_comp record;
BEGIN
  IF v_internal OR v_role = 'service_role' OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Users can only join PK competitions for themselves';
    END IF;

    SELECT status, is_active, end_date INTO v_comp
    FROM public.pk_competitions
    WHERE id = NEW.competition_id;

    IF NOT FOUND OR COALESCE(v_comp.is_active, false) = false
       OR v_comp.status NOT IN ('upcoming', 'active')
       OR v_comp.end_date <= now() THEN
      RAISE EXCEPTION 'PK competition is not joinable';
    END IF;

    IF COALESCE(NEW.score, 0) <> 0
       OR NEW.rank_position IS NOT NULL
       OR COALESCE(NEW.reward_distributed, false) <> false THEN
      RAISE EXCEPTION 'PK score and reward fields are system-managed';
    END IF;

    NEW.score := 0;
    NEW.rank_position := NULL;
    NEW.reward_distributed := false;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'PK participant updates are system-managed';
END;
$$;

DROP TRIGGER IF EXISTS guard_pk_participants_write_trigger ON public.pk_participants;
CREATE TRIGGER guard_pk_participants_write_trigger
BEFORE INSERT OR UPDATE ON public.pk_participants
FOR EACH ROW EXECUTE FUNCTION public.guard_pk_participants_write();

DROP POLICY IF EXISTS "Users can join PK competitions" ON public.pk_participants;
DROP POLICY IF EXISTS u_ins_pk_part ON public.pk_participants;
CREATE POLICY u_ins_pk_part
ON public.pk_participants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE(score, 0) = 0
  AND rank_position IS NULL
  AND COALESCE(reward_distributed, false) = false
  AND EXISTS (
    SELECT 1 FROM public.pk_competitions c
    WHERE c.id = competition_id
      AND c.is_active = true
      AND c.status IN ('upcoming', 'active')
      AND c.end_date > now()
  )
);

-- Make PK reward distribution use the current pk_participants schema and prevent duplicate payouts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pk_reward_history_competition_user
ON public.pk_reward_history (competition_id, user_id);

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
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_pk_rewards(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_pk_rewards(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.distribute_pk_rewards(uuid) TO anon, authenticated;

-- Preserve the trigger-style auto_distribute_pk_rewards function name if it exists, but require backend/admin through distribute_pk_rewards.
REVOKE ALL ON FUNCTION public.auto_distribute_pk_rewards() FROM PUBLIC, anon, authenticated;