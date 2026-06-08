CREATE OR REPLACE FUNCTION public.end_pk_battle(p_battle_id uuid, p_reason text DEFAULT 'time_up'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _battle       record;
  _winner_id    uuid;
  _loser_id     uuid;
  _winner_score bigint;
  _loser_score  bigint;
  _mvp_id       uuid;
  _final        text;
  _punish_secs  integer := 90;
  _bonus_beans  bigint := 0;
  _reward_pct   numeric := 0.70;
BEGIN
  SELECT * INTO _battle
    FROM public.pk_battles
   WHERE id = p_battle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
  END IF;

  IF _battle.status = 'ended' THEN
    RETURN jsonb_build_object('ok', true, 'already_ended', true);
  END IF;

  IF COALESCE(_battle.challenger_score,0) > COALESCE(_battle.opponent_score,0) THEN
    _winner_id    := COALESCE(_battle.challenger_id, _battle.host1_id);
    _loser_id     := COALESCE(_battle.opponent_id, _battle.host2_id);
    _winner_score := COALESCE(_battle.challenger_score,0);
    _loser_score  := COALESCE(_battle.opponent_score,0);
    _final := 'winner_decided';
  ELSIF COALESCE(_battle.opponent_score,0) > COALESCE(_battle.challenger_score,0) THEN
    _winner_id    := COALESCE(_battle.opponent_id, _battle.host2_id);
    _loser_id     := COALESCE(_battle.challenger_id, _battle.host1_id);
    _winner_score := COALESCE(_battle.opponent_score,0);
    _loser_score  := COALESCE(_battle.challenger_score,0);
    _final := 'winner_decided';
  ELSE
    _winner_id := NULL;
    _loser_id  := NULL;
    _final := 'draw';
  END IF;

  IF p_reason IN ('forfeit_left','forfeit_disconnect','cancelled','ended_admin') THEN
    _final := p_reason;
  END IF;

  -- MVP = top gifter across the battle
  SELECT sender_id INTO _mvp_id
    FROM public.pk_battle_gifts
   WHERE battle_id = p_battle_id
   GROUP BY sender_id
   ORDER BY SUM(coin_amount) DESC
   LIMIT 1;

  -- Winner reward: 70% of loser score, as bonus beans (industry standard)
  IF _winner_id IS NOT NULL AND _loser_score > 0 THEN
    _bonus_beans := FLOOR(_loser_score * _reward_pct)::bigint;
    IF _bonus_beans > 0 THEN
      UPDATE public.profiles
         SET beans          = COALESCE(beans, 0) + _bonus_beans,
             beans_balance  = COALESCE(beans_balance, 0) + _bonus_beans,
             total_earnings = COALESCE(total_earnings, 0) + _bonus_beans,
             updated_at     = now()
       WHERE id = _winner_id;

      INSERT INTO public.coin_transactions
        (user_id, coins_amount, transaction_type, status, notes)
      VALUES
        (_winner_id, _bonus_beans, 'pk_battle_reward', 'completed',
         jsonb_build_object(
           'battle_id', p_battle_id,
           'loser_id', _loser_id,
           'loser_score', _loser_score,
           'reward_pct', _reward_pct,
           'mvp_user_id', _mvp_id
         )::text);
    END IF;
  END IF;

  UPDATE public.pk_battles
     SET status            = 'ended',
         ended_at          = now(),
         winner_user_id    = _winner_id,
         winner_id         = _winner_id,
         mvp_user_id       = _mvp_id,
         final_status      = _final,
         punishment_end_ts = CASE
           WHEN _loser_id IS NOT NULL
             THEN now() + (_punish_secs || ' seconds')::interval
           ELSE NULL
         END,
         updated_at        = now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object(
    'ok', true,
    'winner_user_id', _winner_id,
    'loser_user_id', _loser_id,
    'mvp_user_id', _mvp_id,
    'final_status', _final,
    'bonus_beans', _bonus_beans,
    'punishment_end_ts', CASE WHEN _loser_id IS NOT NULL
      THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END
  );
END;
$function$;