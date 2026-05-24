-- Pkg323 Party Room pass-4: participant insert must be server-authoritative

CREATE OR REPLACE FUNCTION public.enforce_party_participant_insert_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.party_rooms%ROWTYPE;
  v_profile record;
  v_count int := 0;
  v_is_host boolean := false;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'user_id must match authenticated user';
  END IF;

  SELECT * INTO v_room
  FROM public.party_rooms
  WHERE id = NEW.room_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_room.is_active, false) = false THEN
    RAISE EXCEPTION 'Room not found or not active';
  END IF;

  v_is_host := v_room.host_id = v_uid;

  SELECT
    COALESCE(is_banned, false) AS is_banned,
    COALESCE(is_blocked, false) AS is_blocked,
    COALESCE(user_level, 0) AS user_level
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF NOT v_is_host THEN
    IF v_profile.is_banned OR v_profile.is_blocked THEN
      RAISE EXCEPTION 'You are banned';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.live_bans lb
      WHERE lb.user_id = v_uid
        AND lb.is_active = true
        AND (lb.expires_at IS NULL OR lb.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'You are temporarily banned';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE b.blocker_id = v_room.host_id AND b.blocked_id = v_uid
    ) OR EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE ub.blocker_id = v_room.host_id AND ub.blocked_id = v_uid
    ) THEN
      RAISE EXCEPTION 'You are blocked from this room';
    END IF;

    -- Sensitive rooms must go through enter_party_room(), which validates password / fee atomically.
    IF COALESCE(v_room.is_locked, false)
       OR v_room.password_hash IS NOT NULL
       OR COALESCE(v_room.entry_fee, 0) > 0
       OR COALESCE(v_room.min_level, 0) > 0 THEN
      RAISE EXCEPTION 'Use enter_party_room for gated rooms';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.party_room_participants p
    WHERE p.room_id = NEW.room_id
      AND p.left_at IS NULL
      AND p.user_id <> v_uid;

    IF v_count >= COALESCE(v_room.max_participants, 10) THEN
      RAISE EXCEPTION 'Room is full';
    END IF;
  END IF;

  NEW.role := CASE WHEN v_is_host THEN 'host' ELSE 'listener' END;
  NEW.seat_number := CASE WHEN v_is_host THEN COALESCE(NEW.seat_number, 0) ELSE NULL END;
  NEW.is_muted := COALESCE(NEW.is_muted, NOT v_is_host);
  NEW.joined_at := COALESCE(NEW.joined_at, now());
  NEW.left_at := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_enforce_party_participant_insert ON public.party_room_participants;
CREATE TRIGGER tg_enforce_party_participant_insert
  BEFORE INSERT ON public.party_room_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_party_participant_insert_eligibility();

REVOKE EXECUTE ON FUNCTION public.enforce_party_participant_insert_eligibility() FROM anon, authenticated, PUBLIC;

-- Keep the official RPC aligned with the insert trigger and assign host seat 0 on fresh host join.
CREATE OR REPLACE FUNCTION public.enter_party_room(
  p_room_id uuid,
  p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room party_rooms%ROWTYPE;
  v_user_level int;
  v_is_banned boolean;
  v_is_blocked boolean;
  v_coins bigint;
  v_count int;
  v_pwd_ok boolean;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO v_room FROM party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.is_active = false THEN
    RAISE EXCEPTION 'Room not found or not active';
  END IF;

  v_role := CASE WHEN v_room.host_id = v_uid THEN 'host' ELSE 'listener' END;

  IF v_role <> 'host' THEN
    SELECT COALESCE(is_banned, false), COALESCE(is_blocked, false), COALESCE(user_level,0)
      INTO v_is_banned, v_is_blocked, v_user_level FROM profiles WHERE id = v_uid;
    IF v_is_banned OR v_is_blocked THEN RAISE EXCEPTION 'You are banned'; END IF;

    IF EXISTS (SELECT 1 FROM live_bans
        WHERE user_id = v_uid AND is_active = true
          AND (expires_at IS NULL OR expires_at > now())) THEN
      RAISE EXCEPTION 'You are temporarily banned';
    END IF;

    IF EXISTS (SELECT 1 FROM blocked_users
        WHERE blocker_id = v_room.host_id AND blocked_id = v_uid)
       OR EXISTS (SELECT 1 FROM user_blocks
        WHERE blocker_id = v_room.host_id AND blocked_id = v_uid) THEN
      RAISE EXCEPTION 'You are blocked from this room';
    END IF;

    IF COALESCE(v_room.min_level,0) > 0 AND v_user_level < v_room.min_level THEN
      RAISE EXCEPTION 'Level % required to enter', v_room.min_level;
    END IF;

    IF v_room.is_locked = true OR v_room.password_hash IS NOT NULL THEN
      IF p_password IS NULL OR p_password = '' THEN
        RAISE EXCEPTION 'Password required';
      END IF;
      v_pwd_ok := (v_room.password_hash IS NOT NULL
                   AND v_room.password_hash = extensions.crypt(p_password, v_room.password_hash));
      IF NOT v_pwd_ok THEN
        RAISE EXCEPTION 'Invalid password';
      END IF;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM party_room_participants
      WHERE room_id = p_room_id AND left_at IS NULL AND user_id <> v_uid;
    IF v_count >= COALESCE(v_room.max_participants, 10) THEN
      RAISE EXCEPTION 'Room is full';
    END IF;

    IF COALESCE(v_room.entry_fee,0) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM party_room_participants
        WHERE room_id = p_room_id AND user_id = v_uid
      ) THEN
        SELECT COALESCE(coins,0) INTO v_coins FROM profiles WHERE id = v_uid FOR UPDATE;
        IF v_coins < v_room.entry_fee THEN
          RAISE EXCEPTION 'Insufficient coins for entry fee';
        END IF;
        UPDATE profiles SET coins = coins - v_room.entry_fee WHERE id = v_uid;
      END IF;
    END IF;
  END IF;

  INSERT INTO party_room_participants(room_id, user_id, role, seat_number, is_muted, joined_at, left_at)
  VALUES (p_room_id, v_uid, v_role, CASE WHEN v_role = 'host' THEN 0 ELSE NULL END, v_role <> 'host', now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET left_at = NULL,
        role = CASE WHEN party_room_participants.role = 'host' THEN 'host' ELSE EXCLUDED.role END,
        seat_number = CASE
          WHEN EXCLUDED.role = 'host' THEN COALESCE(party_room_participants.seat_number, 0)
          ELSE party_room_participants.seat_number
        END;

  RETURN jsonb_build_object('ok', true, 'role', v_role);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enter_party_room(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_party_room(uuid, text) TO authenticated;