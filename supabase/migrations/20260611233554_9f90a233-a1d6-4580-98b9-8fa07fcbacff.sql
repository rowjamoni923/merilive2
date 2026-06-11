
-- Remove password gating from party rooms (all rooms become public)
CREATE OR REPLACE FUNCTION public.enter_party_room(p_room_id uuid, p_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room party_rooms%ROWTYPE;
  v_profile record;
  v_user_level int := 0;
  v_required_level int := 0;
  v_is_privileged_joiner boolean := false;
  v_coins bigint;
  v_count int;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT * INTO v_room FROM party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.is_active = false THEN RAISE EXCEPTION 'Room not found or not active'; END IF;

  v_role := CASE WHEN v_room.host_id = v_uid THEN 'host' ELSE 'listener' END;

  IF v_role <> 'host' THEN
    SELECT
      COALESCE(is_banned, false) AS is_banned,
      COALESCE(is_blocked, false) AS is_blocked,
      COALESCE(user_level, 0) AS user_level,
      COALESCE(host_level, 0) AS host_level,
      COALESCE(max_user_level, 0) AS max_user_level,
      COALESCE(is_host, false) AS is_host,
      COALESCE(host_status, '') AS host_status,
      COALESCE(gender, '') AS gender
    INTO v_profile
    FROM profiles
    WHERE id = v_uid;

    IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
    IF v_profile.is_banned OR v_profile.is_blocked THEN RAISE EXCEPTION 'You are banned'; END IF;

    v_is_privileged_joiner := v_profile.is_host
      OR lower(v_profile.host_status) = 'approved'
      OR lower(v_profile.gender) = 'female';
    v_user_level := GREATEST(v_profile.user_level, v_profile.host_level, v_profile.max_user_level);

    SELECT COALESCE(CASE WHEN v_is_privileged_joiner THEN min_level_host ELSE min_level_user END, 0)
      INTO v_required_level
    FROM feature_level_requirements
    WHERE feature_key = 'join_party' AND COALESCE(is_active, true) = true
    LIMIT 1;

    IF v_user_level < COALESCE(v_required_level, 0) THEN
      RAISE EXCEPTION 'Level % required to enter', v_required_level;
    END IF;

    IF EXISTS (SELECT 1 FROM live_bans WHERE user_id = v_uid AND is_active = true AND (expires_at IS NULL OR expires_at > now())) THEN
      RAISE EXCEPTION 'You are temporarily banned';
    END IF;

    IF EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = v_room.host_id AND blocked_id = v_uid)
       OR EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = v_room.host_id AND blocked_id = v_uid) THEN
      RAISE EXCEPTION 'You are blocked from this room';
    END IF;

    IF COALESCE(v_room.min_level,0) > 0 AND v_user_level < v_room.min_level THEN
      RAISE EXCEPTION 'Level % required to enter', v_room.min_level;
    END IF;

    -- Password gating REMOVED: all party rooms are public (industry standard).

    SELECT COUNT(*) INTO v_count
    FROM party_room_participants
    WHERE room_id = p_room_id AND left_at IS NULL AND user_id <> v_uid;
    IF v_count >= COALESCE(v_room.max_participants, 10) THEN RAISE EXCEPTION 'Room is full'; END IF;

    IF COALESCE(v_room.entry_fee,0) > 0 THEN
      IF NOT EXISTS (SELECT 1 FROM party_room_participants WHERE room_id = p_room_id AND user_id = v_uid) THEN
        SELECT COALESCE(coins,0) INTO v_coins FROM profiles WHERE id = v_uid FOR UPDATE;
        IF v_coins < v_room.entry_fee THEN RAISE EXCEPTION 'Insufficient coins for entry fee'; END IF;
        UPDATE profiles SET coins = coins - v_room.entry_fee WHERE id = v_uid;
      END IF;
    END IF;
  END IF;

  INSERT INTO party_room_participants(room_id, user_id, role, seat_number, is_muted, joined_at, left_at)
  VALUES (p_room_id, v_uid, v_role, CASE WHEN v_role = 'host' THEN 0 ELSE NULL END, v_role <> 'host', now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET left_at = NULL,
        role = CASE WHEN party_room_participants.role = 'host' THEN 'host' ELSE EXCLUDED.role END,
        seat_number = CASE WHEN EXCLUDED.role = 'host' THEN COALESCE(party_room_participants.seat_number, 0) ELSE party_room_participants.seat_number END,
        is_muted = CASE WHEN EXCLUDED.role = 'host' THEN false ELSE party_room_participants.is_muted END;

  RETURN jsonb_build_object('ok', true, 'role', v_role);
END;
$function$;
