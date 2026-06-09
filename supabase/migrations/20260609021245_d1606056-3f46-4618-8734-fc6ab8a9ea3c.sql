-- PK Battle Hardening — Fix R5 (timer precision), R7 (cross-stream attribution), R8 (double-counting)

-- 1) Allow authenticated participants to request battle end when timer expires.
--    Eliminates the 0–10s gap between client timer hitting 00:00 and the
--    pk-battle-tick cron firing end_pk_battle.
CREATE OR REPLACE FUNCTION public.request_pk_battle_end(p_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _battle record;
BEGIN
  SELECT * INTO _battle
  FROM public.pk_battles
  WHERE id = p_battle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
  END IF;

  IF _battle.challenger_id <> auth.uid() AND _battle.opponent_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_participant');
  END IF;

  IF _battle.status = 'ended' THEN
    RETURN jsonb_build_object('ok', true, 'already_ended', true);
  END IF;

  IF _battle.started_at IS NOT NULL AND _battle.duration_seconds IS NOT NULL THEN
    IF now() < _battle.started_at + (_battle.duration_seconds || ' seconds')::interval THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'timer_still_running');
    END IF;
  ELSIF _battle.status IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_started');
  END IF;

  RETURN public.end_pk_battle(p_battle_id, 'time_up');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_pk_battle_end(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_pk_battle_end(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.request_pk_battle_end(uuid) FROM anon;

-- 2) Drop the legacy handle_pk_gift_scoring trigger to prevent double-counting (R8).
--    The authoritative path is gift-service → bill_pk_gift().
DROP TRIGGER IF EXISTS handle_pk_gift_scoring ON public.gift_transactions;

-- 3) Update bill_pk_gift with optional p_stream_id guard (R7).
--    If p_stream_id is provided, the gift must come from one of the two PK streams.
CREATE OR REPLACE FUNCTION public.bill_pk_gift(
  p_battle_id uuid,
  p_sender_id uuid,
  p_target_host_id uuid,
  p_gift_id uuid,
  p_coin_amount bigint,
  p_stream_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _battle record;
  _score bigint;
  _phase text;
  _side text;
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
  END IF;

  IF p_stream_id IS NOT NULL THEN
    IF p_stream_id <> COALESCE(_battle.challenger_stream_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND p_stream_id <> COALESCE(_battle.opponent_stream_id, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'gift_not_from_pk_stream');
    END IF;
  END IF;

  IF _battle.status <> 'active' THEN
    _phase := 'warmup';
    _score := 0;
  ELSIF _battle.started_at IS NOT NULL AND _battle.duration_seconds IS NOT NULL THEN
    IF now() >= _battle.started_at + (_battle.duration_seconds || ' seconds')::interval THEN
      _phase := 'punishment';
      _score := 0;
    ELSE
      _phase := 'main';
      _score := p_coin_amount;
    END IF;
  ELSE
    _phase := 'warmup';
    _score := 0;
  END IF;

  IF p_target_host_id = COALESCE(_battle.challenger_id, _battle.host1_id) THEN
    _side := 'challenger';
  ELSIF p_target_host_id = COALESCE(_battle.opponent_id, _battle.host2_id) THEN
    _side := 'opponent';
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'target_not_in_battle');
  END IF;

  INSERT INTO public.pk_battle_gifts (
    battle_id, sender_id, target_host_id, gift_id, coin_amount, score_value, phase
  ) VALUES (
    p_battle_id, p_sender_id, p_target_host_id, p_gift_id, p_coin_amount, _score, _phase
  );

  IF _side = 'challenger' THEN
    UPDATE public.pk_battles
    SET challenger_score = COALESCE(challenger_score,0) + _score,
        host1_score      = COALESCE(host1_score,0)      + _score
    WHERE id = p_battle_id;
  ELSE
    UPDATE public.pk_battles
    SET opponent_score = COALESCE(opponent_score,0) + _score,
        host2_score      = COALESCE(host2_score,0)      + _score
    WHERE id = p_battle_id;
  END IF;

  UPDATE public.pk_battles
  SET total_gift_value = COALESCE(total_gift_value,0) + p_coin_amount
  WHERE id = p_battle_id;

  RETURN jsonb_build_object('ok', true, 'phase', _phase, 'score', _score, 'side', _side);
END;
$function$;