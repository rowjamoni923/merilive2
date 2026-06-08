
-- ============================================================
-- PK Battle Step 1: server-authoritative schema foundation
-- Additive only — legacy columns kept + sync trigger for APK compat
-- ============================================================

-- 1) pk_battles new columns ----------------------------------
ALTER TABLE public.pk_battles
  ADD COLUMN IF NOT EXISTS duration_seconds      integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS challenger_stream_id  uuid,
  ADD COLUMN IF NOT EXISTS opponent_stream_id    uuid,
  ADD COLUMN IF NOT EXISTS phase_config          jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS winner_user_id        uuid,
  ADD COLUMN IF NOT EXISTS mvp_user_id           uuid,
  ADD COLUMN IF NOT EXISTS total_gift_value      bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS punishment_end_ts     timestamptz,
  ADD COLUMN IF NOT EXISTS final_status          text,
  ADD COLUMN IF NOT EXISTS connect_grace_seconds integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS min_host_level        integer NOT NULL DEFAULT 5;

-- Backfill canonical columns from legacy ones (one-time)
UPDATE public.pk_battles
   SET challenger_stream_id = COALESCE(challenger_stream_id, stream1_id),
       opponent_stream_id   = COALESCE(opponent_stream_id, stream2_id),
       duration_seconds     = CASE
         WHEN duration_seconds = 300 AND duration_minutes IS NOT NULL
           THEN duration_minutes * 60
         ELSE duration_seconds
       END
 WHERE TRUE;

-- Two-way sync trigger so the existing APK (reads host1/host2/stream1/stream2/
-- challenger_id/opponent_id/duration_minutes) and the new code (reads
-- challenger_*/opponent_*/duration_seconds) stay coherent on every INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.pk_battles_sync_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- challenger ↔ host1 / stream1
  IF NEW.host1_id IS NULL AND NEW.challenger_id IS NOT NULL THEN
    NEW.host1_id := NEW.challenger_id;
  ELSIF NEW.challenger_id IS NULL AND NEW.host1_id IS NOT NULL THEN
    NEW.challenger_id := NEW.host1_id;
  END IF;

  IF NEW.stream1_id IS NULL AND NEW.challenger_stream_id IS NOT NULL THEN
    NEW.stream1_id := NEW.challenger_stream_id;
  ELSIF NEW.challenger_stream_id IS NULL AND NEW.stream1_id IS NOT NULL THEN
    NEW.challenger_stream_id := NEW.stream1_id;
  END IF;

  -- opponent ↔ host2 / stream2
  IF NEW.host2_id IS NULL AND NEW.opponent_id IS NOT NULL THEN
    NEW.host2_id := NEW.opponent_id;
  ELSIF NEW.opponent_id IS NULL AND NEW.host2_id IS NOT NULL THEN
    NEW.opponent_id := NEW.host2_id;
  END IF;

  IF NEW.stream2_id IS NULL AND NEW.opponent_stream_id IS NOT NULL THEN
    NEW.stream2_id := NEW.opponent_stream_id;
  ELSIF NEW.opponent_stream_id IS NULL AND NEW.stream2_id IS NOT NULL THEN
    NEW.opponent_stream_id := NEW.stream2_id;
  END IF;

  -- duration_seconds ↔ duration_minutes
  IF NEW.duration_seconds IS NOT NULL THEN
    NEW.duration_minutes := GREATEST(1, ROUND(NEW.duration_seconds::numeric / 60.0)::int);
  END IF;

  -- score sync (legacy host1_score/host2_score mirror challenger_score/opponent_score)
  NEW.host1_score := COALESCE(NEW.challenger_score, NEW.host1_score, 0);
  NEW.host2_score := COALESCE(NEW.opponent_score, NEW.host2_score, 0);

  -- winner_id (legacy text) mirrors winner_user_id when set
  IF NEW.winner_user_id IS NOT NULL AND NEW.winner_id IS NULL THEN
    NEW.winner_id := NEW.winner_user_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pk_battles_sync_legacy_trg ON public.pk_battles;
CREATE TRIGGER pk_battles_sync_legacy_trg
  BEFORE INSERT OR UPDATE ON public.pk_battles
  FOR EACH ROW EXECUTE FUNCTION public.pk_battles_sync_legacy();

-- Useful indexes for live battle lookups + leaderboard
CREATE INDEX IF NOT EXISTS pk_battles_status_started_idx
  ON public.pk_battles (status, started_at DESC);
CREATE INDEX IF NOT EXISTS pk_battles_active_pair_idx
  ON public.pk_battles (challenger_id, opponent_id)
  WHERE status IN ('accepted','active');

-- 2) pk_battle_gifts new columns -----------------------------
ALTER TABLE public.pk_battle_gifts
  ADD COLUMN IF NOT EXISTS score_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase       text   NOT NULL DEFAULT 'main';

CREATE INDEX IF NOT EXISTS pk_battle_gifts_battle_target_idx
  ON public.pk_battle_gifts (battle_id, target_host_id);
CREATE INDEX IF NOT EXISTS pk_battle_gifts_battle_sender_idx
  ON public.pk_battle_gifts (battle_id, sender_id);

-- 3) bill_pk_gift — atomic server-authoritative score writer -
CREATE OR REPLACE FUNCTION public.bill_pk_gift(
  p_battle_id      uuid,
  p_sender_id      uuid,
  p_target_host_id uuid,
  p_gift_id        uuid,
  p_coin_amount    bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _battle  record;
  _score   bigint;
  _phase   text;
  _now     timestamptz := now();
BEGIN
  IF p_coin_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  SELECT * INTO _battle
    FROM public.pk_battles
   WHERE id = p_battle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
  END IF;

  IF _battle.status NOT IN ('accepted','active') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_active', 'status', _battle.status);
  END IF;

  IF p_target_host_id <> COALESCE(_battle.challenger_id, _battle.host1_id)
     AND p_target_host_id <> COALESCE(_battle.opponent_id, _battle.host2_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'target_not_in_battle');
  END IF;

  -- Phase detection (warmup ≤ grace, punishment after main timer, else main)
  IF _battle.started_at IS NULL THEN
    _phase := 'warmup';
  ELSIF _now > _battle.started_at + (_battle.duration_seconds || ' seconds')::interval THEN
    _phase := 'punishment';
  ELSIF _now < _battle.started_at + (_battle.connect_grace_seconds || ' seconds')::interval THEN
    _phase := 'warmup';
  ELSE
    _phase := 'main';
  END IF;

  -- 1 diamond = 1 score (industry standard); warmup/punishment don't score
  _score := CASE WHEN _phase = 'main' THEN p_coin_amount ELSE 0 END;

  INSERT INTO public.pk_battle_gifts
    (battle_id, sender_id, target_host_id, gift_id, coin_amount, score_value, phase)
  VALUES
    (p_battle_id, p_sender_id, p_target_host_id, p_gift_id, p_coin_amount, _score, _phase);

  -- Update the correct side's running score on pk_battles
  IF p_target_host_id = COALESCE(_battle.challenger_id, _battle.host1_id) THEN
    UPDATE public.pk_battles
       SET challenger_score = COALESCE(challenger_score,0) + _score,
           total_gift_value = COALESCE(total_gift_value,0) + p_coin_amount,
           updated_at       = now()
     WHERE id = p_battle_id;
  ELSE
    UPDATE public.pk_battles
       SET opponent_score   = COALESCE(opponent_score,0) + _score,
           total_gift_value = COALESCE(total_gift_value,0) + p_coin_amount,
           updated_at       = now()
     WHERE id = p_battle_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'phase', _phase,
    'score_added', _score,
    'coin_amount', p_coin_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bill_pk_gift(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bill_pk_gift(uuid,uuid,uuid,uuid,bigint) TO service_role;

-- 4) end_pk_battle — decides winner + MVP from server-stored data
CREATE OR REPLACE FUNCTION public.end_pk_battle(
  p_battle_id uuid,
  p_reason    text DEFAULT 'time_up'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _battle      record;
  _winner_id   uuid;
  _mvp_id      uuid;
  _final       text;
  _punish_secs integer := 90;
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

  -- Decide winner from server-stored scores
  IF COALESCE(_battle.challenger_score,0) > COALESCE(_battle.opponent_score,0) THEN
    _winner_id := COALESCE(_battle.challenger_id, _battle.host1_id);
    _final := 'winner_decided';
  ELSIF COALESCE(_battle.opponent_score,0) > COALESCE(_battle.challenger_score,0) THEN
    _winner_id := COALESCE(_battle.opponent_id, _battle.host2_id);
    _final := 'winner_decided';
  ELSE
    _winner_id := NULL;
    _final := 'draw';
  END IF;

  IF p_reason IN ('forfeit_left','forfeit_disconnect','cancelled','ended_admin') THEN
    _final := p_reason;
    IF p_reason IN ('forfeit_left','forfeit_disconnect') THEN
      -- Winner is the side that did NOT forfeit (caller passes target via reason metadata later)
      NULL;
    END IF;
  END IF;

  -- MVP = top gifter across the battle (industry standard: crown)
  SELECT sender_id INTO _mvp_id
    FROM public.pk_battle_gifts
   WHERE battle_id = p_battle_id
   GROUP BY sender_id
   ORDER BY SUM(coin_amount) DESC
   LIMIT 1;

  UPDATE public.pk_battles
     SET status            = 'ended',
         ended_at          = now(),
         winner_user_id    = _winner_id,
         mvp_user_id       = _mvp_id,
         final_status      = _final,
         punishment_end_ts = CASE
           WHEN _winner_id IS NOT NULL
             THEN now() + (_punish_secs || ' seconds')::interval
           ELSE NULL
         END,
         updated_at        = now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object(
    'ok', true,
    'winner_user_id', _winner_id,
    'mvp_user_id', _mvp_id,
    'final_status', _final,
    'punishment_end_ts', CASE WHEN _winner_id IS NOT NULL
      THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.end_pk_battle(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_pk_battle(uuid,text) TO service_role;

-- 5) Helper: get_active_pk_battles for the cron tick (Step 2)
CREATE OR REPLACE FUNCTION public.get_expired_pk_battles()
RETURNS TABLE(battle_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM public.pk_battles
   WHERE status IN ('accepted','active')
     AND started_at IS NOT NULL
     AND now() >= started_at + (duration_seconds || ' seconds')::interval;
$$;

REVOKE ALL ON FUNCTION public.get_expired_pk_battles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_expired_pk_battles() TO service_role;
