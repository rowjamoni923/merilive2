
-- ============================================================================
-- PK BATTLE: Professional rebuild — schema lock + server-authoritative RPCs
-- ============================================================================

-- 0a. Drop dependent legacy triggers + helper functions
DROP TRIGGER IF EXISTS pk_battle_autoend_trg ON public.pk_battles;
DROP TRIGGER IF EXISTS pk_battles_sync_legacy_trg ON public.pk_battles;
DROP FUNCTION IF EXISTS public.pk_battle_autoend() CASCADE;
DROP FUNCTION IF EXISTS public.pk_battles_sync_legacy() CASCADE;

-- 0b. Drop legacy view
DROP VIEW IF EXISTS public.pk_agency_leaderboard;

-- 1. Drop legacy duplicate columns, canonicalize on host1/host2
ALTER TABLE public.pk_battles
  DROP COLUMN IF EXISTS challenger_id,
  DROP COLUMN IF EXISTS opponent_id,
  DROP COLUMN IF EXISTS challenger_score,
  DROP COLUMN IF EXISTS opponent_score,
  DROP COLUMN IF EXISTS challenger_stream_id,
  DROP COLUMN IF EXISTS opponent_stream_id,
  DROP COLUMN IF EXISTS duration_minutes;

-- 2. Status constraint
ALTER TABLE public.pk_battles
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.pk_battles
  DROP CONSTRAINT IF EXISTS pk_battles_status_check;
ALTER TABLE public.pk_battles
  ADD CONSTRAINT pk_battles_status_check
  CHECK (status IN ('pending','active','punishment','completed','cancelled'));

-- 3. Race-free matchmaking
CREATE UNIQUE INDEX IF NOT EXISTS pk_battles_host1_active_uniq
  ON public.pk_battles (host1_id)
  WHERE status IN ('pending','active','punishment');
CREATE UNIQUE INDEX IF NOT EXISTS pk_battles_host2_active_uniq
  ON public.pk_battles (host2_id)
  WHERE status IN ('pending','active','punishment');
CREATE INDEX IF NOT EXISTS pk_battles_status_started_idx
  ON public.pk_battles (status, started_at);
CREATE INDEX IF NOT EXISTS pk_battle_gifts_battle_idx
  ON public.pk_battle_gifts (battle_id, target_host_id);

-- 4. Recreate agency leaderboard view
CREATE OR REPLACE VIEW public.pk_agency_leaderboard AS
SELECT ah.agency_id,
       count(*) FILTER (WHERE b.winner_user_id = ah.host_id) AS wins,
       count(*) FILTER (
         WHERE b.status = 'completed'
           AND b.winner_user_id IS NOT NULL
           AND b.winner_user_id <> ah.host_id
           AND (b.host1_id = ah.host_id OR b.host2_id = ah.host_id)
       ) AS losses,
       COALESCE(sum(
         CASE WHEN b.host1_id = ah.host_id THEN COALESCE(b.host1_score, 0)
              WHEN b.host2_id = ah.host_id THEN COALESCE(b.host2_score, 0)
              ELSE 0 END
       ), 0)::bigint AS total_score
FROM public.agency_hosts ah
LEFT JOIN public.pk_battles b ON b.host1_id = ah.host_id OR b.host2_id = ah.host_id
GROUP BY ah.agency_id;

GRANT SELECT ON public.pk_agency_leaderboard TO authenticated, service_role;

-- ============================================================================
-- 5. RPC: pk_battle_invite
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pk_battle_invite(
  _opponent_id uuid, _duration_seconds integer DEFAULT 300,
  _stream_id uuid DEFAULT NULL, _min_host_level integer DEFAULT 5
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _challenger uuid := auth.uid(); _battle_id uuid;
        _challenger_level int; _opponent_level int;
BEGIN
  IF _challenger IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _opponent_id IS NULL OR _opponent_id = _challenger THEN RAISE EXCEPTION 'invalid opponent'; END IF;
  IF _duration_seconds NOT BETWEEN 60 AND 1800 THEN RAISE EXCEPTION 'duration out of range (60-1800s)'; END IF;
  SELECT COALESCE(level,1) INTO _challenger_level FROM public.profiles WHERE id=_challenger;
  SELECT COALESCE(level,1) INTO _opponent_level FROM public.profiles WHERE id=_opponent_id;
  IF _challenger_level < _min_host_level OR _opponent_level < _min_host_level THEN
    RAISE EXCEPTION 'both hosts need level >= %', _min_host_level;
  END IF;
  INSERT INTO public.pk_battles (
    host1_id, host2_id, stream1_id, status, duration_seconds,
    min_host_level, mode, team_size, phase_config, total_gift_value
  ) VALUES (
    _challenger, _opponent_id, _stream_id, 'pending', _duration_seconds,
    _min_host_level, '1v1', 1, '{}'::jsonb, 0
  ) RETURNING id INTO _battle_id;
  RETURN _battle_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'one of the hosts is already in an active PK battle';
END;
$$;
REVOKE ALL ON FUNCTION public.pk_battle_invite(uuid,integer,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_battle_invite(uuid,integer,uuid,integer) TO authenticated;

-- 6. pk_battle_accept
CREATE OR REPLACE FUNCTION public.pk_battle_accept(_battle_id uuid, _stream_id uuid DEFAULT NULL)
RETURNS public.pk_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _row public.pk_battles;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.pk_battles
  SET status='active', started_at=now(),
      stream2_id=COALESCE(_stream_id, stream2_id), updated_at=now()
  WHERE id=_battle_id AND host2_id=_me AND status='pending'
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'battle not found, not yours, or not pending'; END IF;
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_battle_accept(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_battle_accept(uuid,uuid) TO authenticated;

-- 7. pk_battle_decline
CREATE OR REPLACE FUNCTION public.pk_battle_decline(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.pk_battles
  SET status='cancelled', ended_at=now(), final_status='declined', updated_at=now()
  WHERE id=_battle_id AND status='pending' AND (host1_id=_me OR host2_id=_me);
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot decline'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_battle_decline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_battle_decline(uuid) TO authenticated;

-- 8. pk_battle_send_gift
CREATE OR REPLACE FUNCTION public.pk_battle_send_gift(
  _battle_id uuid, _target_host_id uuid, _gift_id uuid, _quantity integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _battle public.pk_battles;
        _gift_coins bigint; _total_cost bigint; _user_coins bigint;
        _score_value bigint; _phase text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _quantity < 1 OR _quantity > 9999 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
  SELECT * INTO _battle FROM public.pk_battles WHERE id=_battle_id FOR UPDATE;
  IF _battle.id IS NULL THEN RAISE EXCEPTION 'battle not found'; END IF;
  IF _battle.status NOT IN ('active','punishment') THEN
    RAISE EXCEPTION 'battle not accepting gifts (status=%)', _battle.status;
  END IF;
  IF _target_host_id NOT IN (_battle.host1_id, _battle.host2_id) THEN
    RAISE EXCEPTION 'target is not a battle host';
  END IF;
  _phase := CASE WHEN _battle.status='punishment' THEN 'punishment' ELSE 'main' END;
  SELECT COALESCE(coin_cost,0) INTO _gift_coins FROM public.gifts WHERE id=_gift_id;
  IF _gift_coins IS NULL OR _gift_coins <= 0 THEN RAISE EXCEPTION 'invalid gift'; END IF;
  _total_cost := _gift_coins * _quantity;
  _score_value := _total_cost;
  SELECT coins INTO _user_coins FROM public.profiles WHERE id=_me FOR UPDATE;
  IF _user_coins IS NULL OR _user_coins < _total_cost THEN
    RAISE EXCEPTION 'insufficient coins (need %, have %)', _total_cost, COALESCE(_user_coins,0);
  END IF;
  UPDATE public.profiles SET coins=coins-_total_cost WHERE id=_me;
  INSERT INTO public.pk_battle_gifts (battle_id, sender_id, target_host_id, gift_id, coin_amount, score_value, phase)
  VALUES (_battle_id, _me, _target_host_id, _gift_id, _total_cost, _score_value, _phase);
  IF _phase = 'main' THEN
    IF _target_host_id = _battle.host1_id THEN
      UPDATE public.pk_battles
        SET host1_score=host1_score+_score_value, total_gift_value=total_gift_value+_total_cost, updated_at=now()
        WHERE id=_battle_id;
    ELSE
      UPDATE public.pk_battles
        SET host2_score=host2_score+_score_value, total_gift_value=total_gift_value+_total_cost, updated_at=now()
        WHERE id=_battle_id;
    END IF;
  ELSE
    UPDATE public.pk_battles SET total_gift_value=total_gift_value+_total_cost, updated_at=now() WHERE id=_battle_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'phase',_phase,'score_added',_score_value,
    'coins_spent',_total_cost,'remaining_coins',_user_coins-_total_cost);
END;
$$;
REVOKE ALL ON FUNCTION public.pk_battle_send_gift(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_battle_send_gift(uuid,uuid,uuid,integer) TO authenticated;

-- 9. pk_battle_finalize
CREATE OR REPLACE FUNCTION public.pk_battle_finalize(_battle_id uuid)
RETURNS public.pk_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _battle public.pk_battles; _winner uuid; _now timestamptz := now();
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id=_battle_id FOR UPDATE;
  IF _battle.id IS NULL THEN RAISE EXCEPTION 'battle not found'; END IF;
  IF _battle.status='active' AND _battle.started_at IS NOT NULL
     AND _battle.started_at + (_battle.duration_seconds||' seconds')::interval <= _now THEN
    IF _battle.host1_score > _battle.host2_score THEN _winner := _battle.host1_id;
    ELSIF _battle.host2_score > _battle.host1_score THEN _winner := _battle.host2_id;
    ELSE _winner := NULL; END IF;
    UPDATE public.pk_battles
      SET status='punishment', winner_user_id=_winner,
          punishment_end_ts=_now + interval '90 seconds', updated_at=_now
      WHERE id=_battle_id RETURNING * INTO _battle;
    RETURN _battle;
  END IF;
  IF _battle.status='punishment' AND _battle.punishment_end_ts IS NOT NULL
     AND _battle.punishment_end_ts <= _now THEN
    UPDATE public.pk_battles
      SET status='completed', ended_at=_now,
          final_status=CASE WHEN _battle.winner_user_id IS NULL THEN 'draw' ELSE 'win' END,
          updated_at=_now
      WHERE id=_battle_id RETURNING * INTO _battle;
    IF _battle.winner_user_id IS NOT NULL THEN
      UPDATE public.profiles SET pk_wins=COALESCE(pk_wins,0)+1 WHERE id=_battle.winner_user_id;
    END IF;
    RETURN _battle;
  END IF;
  RETURN _battle;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_battle_finalize(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_battle_finalize(uuid) TO service_role;

-- 10. pk_battle_tick_all
CREATE OR REPLACE FUNCTION public.pk_battle_tick_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _rec record; _count int := 0;
BEGIN
  FOR _rec IN
    SELECT id FROM public.pk_battles
    WHERE (status='active' AND started_at + (duration_seconds||' seconds')::interval <= now())
       OR (status='punishment' AND punishment_end_ts <= now())
  LOOP
    PERFORM public.pk_battle_finalize(_rec.id);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.pk_battle_tick_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_battle_tick_all() TO service_role;

-- 11. profiles.pk_wins
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pk_wins integer NOT NULL DEFAULT 0;
