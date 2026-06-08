
-- =============================================
-- 1) pk_match_queue table
-- =============================================
CREATE TABLE IF NOT EXISTS public.pk_match_queue (
  user_id      uuid PRIMARY KEY,
  stream_id    uuid NOT NULL,
  host_level   integer NOT NULL DEFAULT 1,
  level_bracket integer NOT NULL DEFAULT 0,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '90 seconds')
);

CREATE INDEX IF NOT EXISTS pk_match_queue_bracket_joined_idx
  ON public.pk_match_queue (level_bracket, joined_at);

GRANT SELECT ON public.pk_match_queue TO authenticated;
GRANT ALL ON public.pk_match_queue TO service_role;

ALTER TABLE public.pk_match_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue readable to self" ON public.pk_match_queue;
CREATE POLICY "queue readable to self"
  ON public.pk_match_queue FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 2) Upgrade start_pk_battle with anti-collusion
-- =============================================
CREATE OR REPLACE FUNCTION public.start_pk_battle(
  p_opponent_id uuid,
  p_challenger_stream_id uuid,
  p_opponent_stream_id uuid,
  p_duration_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _challenger_id uuid := auth.uid();
  _challenger    record;
  _opponent      record;
  _min_level     integer := 5;
  _duration      integer;
  _battle_id     uuid;
  _existing      uuid;
  _collusion     boolean := false;
BEGIN
  IF _challenger_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF p_opponent_id IS NULL OR _challenger_id = p_opponent_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_battle_self');
  END IF;

  _duration := COALESCE(p_duration_seconds, 300);
  IF _duration < 120 THEN _duration := 120; END IF;
  IF _duration > 900 THEN _duration := 900; END IF;

  SELECT id,
         COALESCE(host_level, user_level, 1) AS lvl,
         active_device_id, last_device_id, last_login_ip, registration_ip
    INTO _challenger
    FROM public.profiles
   WHERE id = _challenger_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'challenger_not_found');
  END IF;

  SELECT id,
         COALESCE(host_level, user_level, 1) AS lvl,
         active_device_id, last_device_id, last_login_ip, registration_ip
    INTO _opponent
    FROM public.profiles
   WHERE id = p_opponent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'opponent_not_found');
  END IF;

  IF _challenger.lvl < _min_level OR _opponent.lvl < _min_level THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'host_level_too_low',
      'min_level', _min_level,
      'challenger_level', _challenger.lvl,
      'opponent_level', _opponent.lvl
    );
  END IF;

  -- Anti-collusion: shared device id or login IP = block
  IF _challenger.active_device_id IS NOT NULL
     AND _challenger.active_device_id = _opponent.active_device_id THEN
    _collusion := true;
  ELSIF _challenger.last_device_id IS NOT NULL
     AND _challenger.last_device_id = _opponent.last_device_id THEN
    _collusion := true;
  ELSIF _challenger.last_login_ip IS NOT NULL
     AND _challenger.last_login_ip = _opponent.last_login_ip THEN
    _collusion := true;
  ELSIF _challenger.registration_ip IS NOT NULL
     AND _challenger.registration_ip = _opponent.registration_ip THEN
    _collusion := true;
  END IF;

  IF _collusion THEN
    RETURN jsonb_build_object('ok', false, 'error', 'collusion_blocked');
  END IF;

  SELECT id INTO _existing
    FROM public.pk_battles
   WHERE status IN ('pending','accepted','active')
     AND (
       challenger_id IN (_challenger_id, p_opponent_id)
       OR opponent_id IN (_challenger_id, p_opponent_id)
       OR host1_id    IN (_challenger_id, p_opponent_id)
       OR host2_id    IN (_challenger_id, p_opponent_id)
     )
   LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'host_already_in_battle',
                              'existing_battle_id', _existing);
  END IF;

  INSERT INTO public.pk_battles (
    challenger_id, opponent_id,
    challenger_stream_id, opponent_stream_id,
    status, duration_seconds, min_host_level
  ) VALUES (
    _challenger_id, p_opponent_id,
    p_challenger_stream_id, p_opponent_stream_id,
    'pending', _duration, _min_level
  ) RETURNING id INTO _battle_id;

  RETURN jsonb_build_object(
    'ok', true,
    'battle_id', _battle_id,
    'duration_seconds', _duration,
    'min_host_level', _min_level,
    'connect_grace_seconds', 5
  );
END;
$function$;

-- =============================================
-- 3) Atomic random-match start (create + activate)
--    Used when both sides have already agreed via FCM
--    notification, so the legacy 2-call race is eliminated.
-- =============================================
CREATE OR REPLACE FUNCTION public.start_pk_battle_random(
  p_opponent_id uuid,
  p_challenger_stream_id uuid,
  p_opponent_stream_id uuid,
  p_duration_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _res jsonb;
  _battle_id uuid;
BEGIN
  _res := public.start_pk_battle(
    p_opponent_id,
    p_challenger_stream_id,
    p_opponent_stream_id,
    p_duration_seconds
  );

  IF NOT COALESCE((_res->>'ok')::boolean, false) THEN
    RETURN _res;
  END IF;

  _battle_id := (_res->>'battle_id')::uuid;

  -- Auto-activate (no opponent click needed — they already agreed via FCM)
  UPDATE public.pk_battles
     SET status     = 'active',
         started_at = now(),
         updated_at = now()
   WHERE id = _battle_id
     AND status = 'pending';

  RETURN _res || jsonb_build_object('auto_accepted', true);
END;
$function$;

-- =============================================
-- 4) Queue join / leave / poll
-- =============================================
CREATE OR REPLACE FUNCTION public.pk_match_queue_join(p_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _lvl integer;
  _bracket integer;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT COALESCE(host_level, user_level, 1) INTO _lvl
    FROM public.profiles WHERE id = _uid;
  IF COALESCE(_lvl,0) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'host_level_too_low', 'min_level', 5);
  END IF;

  -- Sweep expired queue rows opportunistically
  DELETE FROM public.pk_match_queue WHERE expires_at < now();

  _bracket := GREATEST(0, (_lvl / 10)); -- 5–9 → 0, 10–19 → 1, etc.

  INSERT INTO public.pk_match_queue (user_id, stream_id, host_level, level_bracket)
  VALUES (_uid, p_stream_id, _lvl, _bracket)
  ON CONFLICT (user_id) DO UPDATE
    SET stream_id     = EXCLUDED.stream_id,
        host_level    = EXCLUDED.host_level,
        level_bracket = EXCLUDED.level_bracket,
        joined_at     = now(),
        expires_at    = now() + interval '90 seconds';

  RETURN jsonb_build_object('ok', true, 'bracket', _bracket, 'expires_in', 90);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pk_match_queue_leave()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM public.pk_match_queue WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Tries to pair caller with the oldest waiting opponent (same bracket
-- preferred, else any). Returns the candidate to be used by the FCM
-- pipeline — does NOT create a battle (anti-collusion + level gate run
-- when start_pk_battle_random is invoked).
CREATE OR REPLACE FUNCTION public.pk_match_queue_poll()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _mine record;
  _cand record;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  DELETE FROM public.pk_match_queue WHERE expires_at < now();

  SELECT * INTO _mine FROM public.pk_match_queue WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_queue');
  END IF;

  -- Same bracket first, FIFO
  SELECT * INTO _cand
    FROM public.pk_match_queue
   WHERE user_id <> _uid
     AND level_bracket = _mine.level_bracket
   ORDER BY joined_at ASC
   LIMIT 1;

  -- Fallback: any bracket
  IF NOT FOUND THEN
    SELECT * INTO _cand
      FROM public.pk_match_queue
     WHERE user_id <> _uid
     ORDER BY joined_at ASC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'matched', false);
  END IF;

  -- Claim both rows so neither gets paired twice
  DELETE FROM public.pk_match_queue
    WHERE user_id IN (_uid, _cand.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'matched', true,
    'opponent_id', _cand.user_id,
    'opponent_stream_id', _cand.stream_id,
    'opponent_level', _cand.host_level
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.start_pk_battle_random(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_pk_battle_random(uuid,uuid,uuid,integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pk_match_queue_join(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_match_queue_join(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pk_match_queue_leave() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_match_queue_leave() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pk_match_queue_poll() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_match_queue_poll() TO authenticated, service_role;
