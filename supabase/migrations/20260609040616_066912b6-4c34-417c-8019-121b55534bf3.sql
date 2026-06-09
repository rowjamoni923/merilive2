
-- P0 bundle: tie tolerance (±10) + per-user PK stats (wins/losses/draws/streak)

-- 1) Add PK stats columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pk_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pk_losses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pk_draws integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pk_current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pk_longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pk_total_battles integer NOT NULL DEFAULT 0;

-- 2) Rewrite end_pk_battle with tie tolerance + stats updates
CREATE OR REPLACE FUNCTION public.end_pk_battle(p_battle_id uuid, p_reason text DEFAULT 'time_up'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _battle record; _winner_id uuid; _loser_id uuid; _winner_side text;
  _loser_score bigint; _mvp_id uuid; _final text;
  _punish_secs int := 90; _bonus_total bigint := 0; _bonus_each bigint := 0;
  _reward_pct numeric := 0.70; _team_count int := 1; _member record;
  _tie_tolerance int := 10;  -- ±10 coin rounding window → draw
  _diff bigint;
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','battle_not_found'); END IF;
  IF _battle.status = 'ended' THEN RETURN jsonb_build_object('ok',true,'already_ended',true); END IF;

  _diff := COALESCE(_battle.challenger_score,0) - COALESCE(_battle.opponent_score,0);

  IF abs(_diff) <= _tie_tolerance THEN
    _winner_id := NULL; _loser_id := NULL; _winner_side := NULL; _final := 'draw';
  ELSIF _diff > 0 THEN
    _winner_id := COALESCE(_battle.challenger_id,_battle.host1_id);
    _loser_id  := COALESCE(_battle.opponent_id,_battle.host2_id);
    _winner_side := 'challenger'; _loser_score := COALESCE(_battle.opponent_score,0);
    _final := 'winner_decided';
  ELSE
    _winner_id := COALESCE(_battle.opponent_id,_battle.host2_id);
    _loser_id  := COALESCE(_battle.challenger_id,_battle.host1_id);
    _winner_side := 'opponent'; _loser_score := COALESCE(_battle.challenger_score,0);
    _final := 'winner_decided';
  END IF;

  IF p_reason IN ('forfeit_left','forfeit_disconnect','cancelled','ended_admin') THEN
    _final := p_reason;
  END IF;

  SELECT sender_id INTO _mvp_id FROM public.pk_battle_gifts
   WHERE battle_id = p_battle_id GROUP BY sender_id ORDER BY SUM(coin_amount) DESC LIMIT 1;

  IF _winner_side IS NOT NULL AND _loser_score > 0 THEN
    _bonus_total := FLOOR(_loser_score * _reward_pct)::bigint;
    SELECT GREATEST(count(*),1) INTO _team_count FROM public.pk_battle_teams
     WHERE battle_id = p_battle_id AND side = _winner_side;
    _bonus_each := FLOOR(_bonus_total / _team_count)::bigint;
    IF _bonus_each > 0 THEN
      FOR _member IN SELECT user_id FROM public.pk_battle_teams
                      WHERE battle_id = p_battle_id AND side = _winner_side LOOP
        UPDATE public.profiles
           SET beans = COALESCE(beans,0)+_bonus_each,
               beans_balance = COALESCE(beans_balance,0)+_bonus_each,
               total_earnings = COALESCE(total_earnings,0)+_bonus_each,
               updated_at = now()
         WHERE id = _member.user_id;
        INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes)
        VALUES (_member.user_id, _bonus_each, 'pk_battle_reward', 'completed',
          jsonb_build_object('battle_id',p_battle_id,'side',_winner_side,'team_count',_team_count,
                             'reward_pct',_reward_pct,'loser_score',_loser_score,
                             'mvp_user_id',_mvp_id)::text);
      END LOOP;
    END IF;
  END IF;

  -- Per-user PK stats (only for primary 1v1 hosts; team members already counted via host1/host2)
  IF _final = 'draw' THEN
    UPDATE public.profiles
       SET pk_draws = pk_draws + 1,
           pk_total_battles = pk_total_battles + 1,
           pk_current_streak = 0,
           updated_at = now()
     WHERE id IN (
       COALESCE(_battle.challenger_id,_battle.host1_id),
       COALESCE(_battle.opponent_id,_battle.host2_id)
     ) AND id IS NOT NULL;
  ELSIF _final = 'winner_decided' THEN
    UPDATE public.profiles
       SET pk_wins = pk_wins + 1,
           pk_total_battles = pk_total_battles + 1,
           pk_current_streak = pk_current_streak + 1,
           pk_longest_streak = GREATEST(pk_longest_streak, pk_current_streak + 1),
           updated_at = now()
     WHERE id = _winner_id;
    UPDATE public.profiles
       SET pk_losses = pk_losses + 1,
           pk_total_battles = pk_total_battles + 1,
           pk_current_streak = 0,
           updated_at = now()
     WHERE id = _loser_id;
  END IF;

  UPDATE public.pk_battles
     SET status='ended', ended_at=now(),
         winner_user_id=_winner_id, winner_id=_winner_id,
         mvp_user_id=_mvp_id, final_status=_final,
         punishment_end_ts = CASE WHEN _loser_id IS NOT NULL
            THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END,
         updated_at = now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object('ok',true,'winner_user_id',_winner_id,'loser_user_id',_loser_id,
    'mvp_user_id',_mvp_id,'final_status',_final,'bonus_total',_bonus_total,
    'bonus_each',_bonus_each,'team_count',_team_count,'tie_tolerance',_tie_tolerance,
    'punishment_end_ts', CASE WHEN _loser_id IS NOT NULL
      THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END);
END; $function$;
