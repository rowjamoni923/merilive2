
-- 1. Generated alias columns (read-only) for backward compat
ALTER TABLE public.pk_battles
  ADD COLUMN IF NOT EXISTS challenger_id uuid GENERATED ALWAYS AS (host1_id) STORED,
  ADD COLUMN IF NOT EXISTS opponent_id uuid GENERATED ALWAYS AS (host2_id) STORED,
  ADD COLUMN IF NOT EXISTS challenger_stream_id uuid GENERATED ALWAYS AS (stream1_id) STORED,
  ADD COLUMN IF NOT EXISTS opponent_stream_id uuid GENERATED ALWAYS AS (stream2_id) STORED,
  ADD COLUMN IF NOT EXISTS challenger_score integer GENERATED ALWAYS AS (host1_score) STORED,
  ADD COLUMN IF NOT EXISTS opponent_score integer GENERATED ALWAYS AS (host2_score) STORED,
  ADD COLUMN IF NOT EXISTS duration_minutes integer GENERATED ALWAYS AS (GREATEST(1, duration_seconds/60)) STORED;

-- 2. Legacy RPC wrappers → new server-authoritative functions
DROP FUNCTION IF EXISTS public.start_pk_battle(uuid, uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.start_pk_battle(
  p_opponent_id uuid,
  p_challenger_stream_id uuid,
  p_opponent_stream_id uuid,
  p_duration_seconds integer DEFAULT 300
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _battle_id uuid;
BEGIN
  _battle_id := public.pk_battle_invite(p_opponent_id, p_duration_seconds, p_challenger_stream_id, 5);
  -- Record the opponent stream now so it's visible immediately
  IF p_opponent_stream_id IS NOT NULL THEN
    UPDATE public.pk_battles SET stream2_id = p_opponent_stream_id WHERE id = _battle_id;
  END IF;
  RETURN _battle_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_pk_battle(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_pk_battle(uuid,uuid,uuid,integer) TO authenticated;

DROP FUNCTION IF EXISTS public.accept_pk_battle(uuid);
CREATE OR REPLACE FUNCTION public.accept_pk_battle(p_battle_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.pk_battles;
BEGIN
  _row := public.pk_battle_accept(p_battle_id, NULL);
  RETURN _row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_pk_battle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pk_battle(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.request_pk_battle_end(uuid);
CREATE OR REPLACE FUNCTION public.request_pk_battle_end(p_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _battle public.pk_battles;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF _battle.id IS NULL THEN RAISE EXCEPTION 'battle not found'; END IF;
  IF _me <> _battle.host1_id AND _me <> _battle.host2_id THEN
    RAISE EXCEPTION 'only hosts can end battle';
  END IF;
  IF _battle.status = 'pending' THEN
    UPDATE public.pk_battles
      SET status='cancelled', ended_at=now(), final_status='cancelled', updated_at=now()
      WHERE id = p_battle_id;
    RETURN;
  END IF;
  IF _battle.status = 'active' THEN
    -- Force timer to expire now → next tick (or this call) will move to punishment
    UPDATE public.pk_battles
      SET duration_seconds = GREATEST(60, EXTRACT(EPOCH FROM (now() - started_at))::integer),
          updated_at = now()
      WHERE id = p_battle_id;
    PERFORM public.pk_battle_finalize(p_battle_id);
    RETURN;
  END IF;
  IF _battle.status = 'punishment' THEN
    UPDATE public.pk_battles
      SET punishment_end_ts = now(), updated_at = now()
      WHERE id = p_battle_id;
    PERFORM public.pk_battle_finalize(p_battle_id);
    RETURN;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.request_pk_battle_end(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_pk_battle_end(uuid) TO authenticated;
