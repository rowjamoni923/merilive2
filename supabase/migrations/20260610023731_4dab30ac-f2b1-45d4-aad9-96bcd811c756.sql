
-- 1. Widen status CHECK to accept legacy 'ended' too
ALTER TABLE public.pk_battles DROP CONSTRAINT IF EXISTS pk_battles_status_check;
ALTER TABLE public.pk_battles ADD CONSTRAINT pk_battles_status_check
  CHECK (status IN ('pending','active','punishment','completed','ended','cancelled'));

-- Widen unique indexes to also include 'ended' transitional state (so a host can't
-- immediately jump into a new battle during punishment)
DROP INDEX IF EXISTS public.pk_battles_host1_active_uniq;
DROP INDEX IF EXISTS public.pk_battles_host2_active_uniq;
CREATE UNIQUE INDEX pk_battles_host1_active_uniq ON public.pk_battles (host1_id)
  WHERE status IN ('pending','active','punishment');
CREATE UNIQUE INDEX pk_battles_host2_active_uniq ON public.pk_battles (host2_id)
  WHERE status IN ('pending','active','punishment');

-- 2. Fix bill_pk_gift: stop writing to generated alias columns
CREATE OR REPLACE FUNCTION public.bill_pk_gift(
  p_battle_id uuid, p_sender_id uuid, p_target_host_id uuid,
  p_gift_id uuid, p_coin_amount bigint, p_stream_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE _battle record; _score bigint; _phase text; _side text;
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','battle_not_found'); END IF;

  IF p_stream_id IS NOT NULL THEN
    IF p_stream_id <> COALESCE(_battle.stream1_id,'00000000-0000-0000-0000-000000000000'::uuid)
       AND p_stream_id <> COALESCE(_battle.stream2_id,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      RETURN jsonb_build_object('ok',false,'reason','gift_not_from_pk_stream');
    END IF;
  END IF;

  IF _battle.status NOT IN ('active','punishment') THEN
    _phase := 'warmup'; _score := 0;
  ELSIF _battle.status = 'punishment' THEN
    _phase := 'punishment'; _score := 0;
  ELSIF _battle.started_at IS NOT NULL AND _battle.duration_seconds IS NOT NULL
        AND now() >= _battle.started_at + (_battle.duration_seconds || ' seconds')::interval THEN
    _phase := 'punishment'; _score := 0;
  ELSE
    _phase := 'main'; _score := p_coin_amount;
  END IF;

  IF p_target_host_id = _battle.host1_id THEN _side := 'challenger';
  ELSIF p_target_host_id = _battle.host2_id THEN _side := 'opponent';
  ELSE RETURN jsonb_build_object('ok',false,'reason','target_not_in_battle'); END IF;

  INSERT INTO public.pk_battle_gifts (
    battle_id, sender_id, target_host_id, gift_id, coin_amount, score_value, phase
  ) VALUES (p_battle_id, p_sender_id, p_target_host_id, p_gift_id, p_coin_amount, _score, _phase);

  IF _side = 'challenger' THEN
    UPDATE public.pk_battles
      SET host1_score = COALESCE(host1_score,0) + _score,
          total_gift_value = COALESCE(total_gift_value,0) + p_coin_amount,
          updated_at = now()
      WHERE id = p_battle_id;
  ELSE
    UPDATE public.pk_battles
      SET host2_score = COALESCE(host2_score,0) + _score,
          total_gift_value = COALESCE(total_gift_value,0) + p_coin_amount,
          updated_at = now()
      WHERE id = p_battle_id;
  END IF;

  RETURN jsonb_build_object('ok',true,'phase',_phase,'score',_score,'side',_side);
END;
$function$;

-- 3. Re-point new tick & legacy request_end to the reward-aware end_pk_battle
CREATE OR REPLACE FUNCTION public.pk_battle_finalize(_battle_id uuid)
RETURNS public.pk_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _battle public.pk_battles; _now timestamptz := now();
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id = _battle_id;
  IF _battle.id IS NULL THEN RAISE EXCEPTION 'battle not found'; END IF;

  -- Active timer expired → end battle (status='ended', 90s punishment starts)
  IF _battle.status = 'active' AND _battle.started_at IS NOT NULL
     AND _battle.started_at + (_battle.duration_seconds || ' seconds')::interval <= _now THEN
    PERFORM public.end_pk_battle(_battle_id, 'time_up');
    SELECT * INTO _battle FROM public.pk_battles WHERE id = _battle_id;
    RETURN _battle;
  END IF;

  -- Punishment expired → mark completed (final status already set by end_pk_battle)
  IF _battle.status IN ('ended','punishment') AND _battle.punishment_end_ts IS NOT NULL
     AND _battle.punishment_end_ts <= _now THEN
    UPDATE public.pk_battles
      SET status='completed', updated_at=_now
      WHERE id=_battle_id RETURNING * INTO _battle;
    RETURN _battle;
  END IF;

  RETURN _battle;
END;
$$;

-- 4. Update tick_all to include 'ended' state (punishment phase from end_pk_battle)
CREATE OR REPLACE FUNCTION public.pk_battle_tick_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _rec record; _count int := 0;
BEGIN
  FOR _rec IN
    SELECT id FROM public.pk_battles
    WHERE (status='active' AND started_at IS NOT NULL
            AND started_at + (duration_seconds || ' seconds')::interval <= now())
       OR (status IN ('ended','punishment') AND punishment_end_ts IS NOT NULL
            AND punishment_end_ts <= now())
  LOOP
    BEGIN
      PERFORM public.pk_battle_finalize(_rec.id);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pk_battle_finalize failed for %: %', _rec.id, SQLERRM;
    END;
  END LOOP;
  RETURN _count;
END;
$$;
