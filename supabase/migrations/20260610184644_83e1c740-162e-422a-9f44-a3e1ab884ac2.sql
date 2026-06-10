-- =====================================================
-- PK Battle Wave 1 — runtime bug fixes
-- =====================================================

-- 1. Widen status CHECK to include 'declined' (PKBattleRequest.handleDecline uses it)
ALTER TABLE public.pk_battles DROP CONSTRAINT IF EXISTS pk_battles_status_check;
ALTER TABLE public.pk_battles ADD CONSTRAINT pk_battles_status_check
  CHECK (status IN ('pending','active','punishment','completed','ended','cancelled','declined'));

-- 2. Replace start_pk_battle: return jsonb, use correct level columns, add anti-collusion
DROP FUNCTION IF EXISTS public.start_pk_battle(uuid, uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.start_pk_battle(
  p_opponent_id uuid,
  p_challenger_stream_id uuid,
  p_opponent_stream_id uuid,
  p_duration_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _c record;
  _o record;
  _min_level integer := 5;
  _duration integer;
  _battle_id uuid;
  _existing uuid;
BEGIN
  IF _me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF p_opponent_id IS NULL OR _me = p_opponent_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_battle_self');
  END IF;

  _duration := COALESCE(p_duration_seconds, 300);
  IF _duration < 120 THEN _duration := 120; END IF;
  IF _duration > 900 THEN _duration := 900; END IF;

  SELECT id,
         COALESCE(host_level, user_level, 1) AS lvl,
         active_device_id, last_device_id, last_login_ip, registration_ip
    INTO _c FROM public.profiles WHERE id = _me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'challenger_not_found');
  END IF;

  SELECT id,
         COALESCE(host_level, user_level, 1) AS lvl,
         active_device_id, last_device_id, last_login_ip, registration_ip
    INTO _o FROM public.profiles WHERE id = p_opponent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'opponent_not_found');
  END IF;

  IF _c.lvl < _min_level OR _o.lvl < _min_level THEN
    RETURN jsonb_build_object('ok', false, 'error', 'host_level_too_low',
      'min_level', _min_level, 'challenger_level', _c.lvl, 'opponent_level', _o.lvl);
  END IF;

  -- Anti-collusion: shared device or IP blocks the match
  IF (_c.active_device_id IS NOT NULL AND _c.active_device_id = _o.active_device_id)
     OR (_c.last_device_id IS NOT NULL AND _c.last_device_id = _o.last_device_id)
     OR (_c.last_login_ip IS NOT NULL AND _c.last_login_ip = _o.last_login_ip)
     OR (_c.registration_ip IS NOT NULL AND _c.registration_ip = _o.registration_ip)
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'collusion_blocked');
  END IF;

  -- One battle at a time per host
  SELECT id INTO _existing FROM public.pk_battles
   WHERE status IN ('pending','active','punishment')
     AND (host1_id IN (_me, p_opponent_id) OR host2_id IN (_me, p_opponent_id))
   LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'host_already_in_battle', 'existing_battle_id', _existing);
  END IF;

  INSERT INTO public.pk_battles (
    host1_id, host2_id, stream1_id, stream2_id,
    status, duration_seconds, min_host_level,
    mode, team_size, phase_config, total_gift_value
  ) VALUES (
    _me, p_opponent_id, p_challenger_stream_id, p_opponent_stream_id,
    'pending', _duration, _min_level,
    '1v1', 1, '{}'::jsonb, 0
  ) RETURNING id INTO _battle_id;

  RETURN jsonb_build_object('ok', true,
    'battle_id', _battle_id,
    'duration_seconds', _duration,
    'min_host_level', _min_level,
    'connect_grace_seconds', 5);
END;
$$;
REVOKE ALL ON FUNCTION public.start_pk_battle(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_pk_battle(uuid,uuid,uuid,integer) TO authenticated, service_role;

-- 3. Replace accept_pk_battle: return jsonb, row-locked
DROP FUNCTION IF EXISTS public.accept_pk_battle(uuid);
CREATE OR REPLACE FUNCTION public.accept_pk_battle(p_battle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _b public.pk_battles;
BEGIN
  IF _me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO _b FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'battle_not_found');
  END IF;
  IF _b.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handled', 'status', _b.status);
  END IF;
  IF _me <> _b.host2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_invited_host');
  END IF;

  UPDATE public.pk_battles
     SET status='active', started_at=now(), updated_at=now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object('ok', true,
    'battle_id', p_battle_id,
    'duration_seconds', _b.duration_seconds,
    'started_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.accept_pk_battle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pk_battle(uuid) TO authenticated, service_role;