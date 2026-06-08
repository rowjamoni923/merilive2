
-- ============================================================
-- PK Battle Step 2 (DB): start_pk_battle RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_pk_battle(
  p_opponent_id            uuid,
  p_challenger_stream_id   uuid,
  p_opponent_stream_id     uuid,
  p_duration_seconds       integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _challenger_id   uuid := auth.uid();
  _challenger      record;
  _opponent        record;
  _min_level       integer := 5;
  _duration        integer;
  _battle_id       uuid;
  _existing        uuid;
BEGIN
  IF _challenger_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF p_opponent_id IS NULL OR _challenger_id = p_opponent_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_battle_self');
  END IF;

  -- Clamp duration (industry: 2–15 min, default 5 min)
  _duration := COALESCE(p_duration_seconds, 300);
  IF _duration < 120 THEN _duration := 120; END IF;
  IF _duration > 900 THEN _duration := 900; END IF;

  -- Validate both hosts exist + meet level gate
  SELECT id, COALESCE(host_level, user_level, 1) AS lvl
    INTO _challenger
    FROM public.profiles
   WHERE id = _challenger_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'challenger_not_found');
  END IF;

  SELECT id, COALESCE(host_level, user_level, 1) AS lvl
    INTO _opponent
    FROM public.profiles
   WHERE id = p_opponent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'opponent_not_found');
  END IF;

  IF _challenger.lvl < _min_level OR _opponent.lvl < _min_level THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'host_level_too_low',
      'min_level', _min_level,
      'challenger_level', _challenger.lvl,
      'opponent_level', _opponent.lvl
    );
  END IF;

  -- Anti-double-accept: either host must have NO in-flight battle.
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
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'host_already_in_battle',
      'existing_battle_id', _existing
    );
  END IF;

  -- Create the battle (sync trigger mirrors legacy columns automatically)
  INSERT INTO public.pk_battles (
    challenger_id, opponent_id,
    challenger_stream_id, opponent_stream_id,
    status, duration_seconds, min_host_level
  ) VALUES (
    _challenger_id, p_opponent_id,
    p_challenger_stream_id, p_opponent_stream_id,
    'pending', _duration, _min_level
  )
  RETURNING id INTO _battle_id;

  RETURN jsonb_build_object(
    'ok', true,
    'battle_id', _battle_id,
    'duration_seconds', _duration,
    'min_host_level', _min_level,
    'connect_grace_seconds', 5
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_pk_battle(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_pk_battle(uuid,uuid,uuid,integer) TO authenticated, service_role;

-- ============================================================
-- Accept-battle RPC (server-side anti-race accept)
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_pk_battle(p_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    uuid := auth.uid();
  _battle record;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO _battle
    FROM public.pk_battles
   WHERE id = p_battle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'battle_not_found');
  END IF;

  IF COALESCE(_battle.opponent_id, _battle.host2_id) <> _uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_opponent');
  END IF;

  IF _battle.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handled', 'status', _battle.status);
  END IF;

  UPDATE public.pk_battles
     SET status     = 'active',
         started_at = now(),
         updated_at = now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object('ok', true, 'battle_id', p_battle_id, 'started_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.accept_pk_battle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pk_battle(uuid) TO authenticated, service_role;
