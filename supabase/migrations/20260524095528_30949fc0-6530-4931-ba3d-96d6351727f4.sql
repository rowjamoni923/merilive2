
-- A. Unique constraint enabling upsert / preventing duplicates
ALTER TABLE public.party_room_participants
  ADD CONSTRAINT party_room_participants_room_user_uniq UNIQUE (room_id, user_id);

-- B. Tighten participants UPDATE — block self-escalation
DROP POLICY IF EXISTS a_upd_party_part ON public.party_room_participants;

-- Self-update policy: cannot self-promote role/seat; cannot self-unmute if host muted
CREATE POLICY a_upd_party_part_self
ON public.party_room_participants
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND room_id = (SELECT room_id FROM public.party_room_participants p WHERE p.id = party_room_participants.id)
  AND user_id = (SELECT user_id FROM public.party_room_participants p WHERE p.id = party_room_participants.id)
);

-- Trigger: enforce field-level immutability for self updates
CREATE OR REPLACE FUNCTION public.guard_party_participant_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_host boolean;
BEGIN
  IF v_uid IS NULL OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- Is caller the room's host?
  SELECT (r.host_id = v_uid) INTO v_is_host FROM party_rooms r WHERE r.id = NEW.room_id;
  v_is_host := COALESCE(v_is_host, false);

  -- Immutable always (anyone)
  IF NEW.room_id IS DISTINCT FROM OLD.room_id THEN
    RAISE EXCEPTION 'room_id immutable';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id immutable';
  END IF;
  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'joined_at immutable';
  END IF;

  -- Self update restrictions
  IF NEW.user_id = v_uid AND NOT v_is_host THEN
    -- Cannot change role at all (host promotes via separate flow)
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role can only be changed by the host';
    END IF;
    -- Cannot change seat_number themselves (must use seat request / host approval)
    IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
      RAISE EXCEPTION 'seat_number can only be changed by the host';
    END IF;
    -- Cannot self-unmute when previously muted (host-mute persists)
    IF OLD.is_muted = true AND NEW.is_muted = false THEN
      RAISE EXCEPTION 'cannot self-unmute; ask the host';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_party_participant_update ON public.party_room_participants;
CREATE TRIGGER tg_guard_party_participant_update
  BEFORE UPDATE ON public.party_room_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_party_participant_self_update();

-- C. Host policy: host can UPDATE participants in own room (for kick via left_at, seat assignment, mute)
CREATE POLICY a_upd_party_part_host
ON public.party_room_participants
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM party_rooms r
  WHERE r.id = party_room_participants.room_id AND r.host_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM party_rooms r
  WHERE r.id = party_room_participants.room_id AND r.host_id = auth.uid()
));

-- Host can DELETE (kick) participants in own room
CREATE POLICY a_del_party_part_host
ON public.party_room_participants
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM party_rooms r
  WHERE r.id = party_room_participants.room_id AND r.host_id = auth.uid()
));

-- D. Tighten participants SELECT — members + host + admin
DROP POLICY IF EXISTS a_read_party_part ON public.party_room_participants;
CREATE POLICY a_read_party_part
ON public.party_room_participants
FOR SELECT
USING (
  -- Caller is themselves in this participant row
  user_id = auth.uid()
  -- Caller is the host of the room
  OR EXISTS (SELECT 1 FROM party_rooms r WHERE r.id = party_room_participants.room_id AND r.host_id = auth.uid())
  -- Caller is also an active participant of the same room
  OR EXISTS (
    SELECT 1 FROM party_room_participants p2
    WHERE p2.room_id = party_room_participants.room_id
      AND p2.user_id = auth.uid()
      AND p2.left_at IS NULL
  )
  -- Admins
  OR auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
);

-- E. seat_invitations: only host can invite + validate seat_number range + default expiry
DROP POLICY IF EXISTS u_ins_seat_inv ON public.seat_invitations;
CREATE POLICY u_ins_seat_inv
ON public.seat_invitations
FOR INSERT
WITH CHECK (
  auth.uid() = inviter_id
  AND EXISTS (
    SELECT 1 FROM party_rooms r
    WHERE r.id = room_id AND r.host_id = auth.uid() AND r.is_active = true
  )
  AND seat_number IS NOT NULL
  AND seat_number >= 0
  AND seat_number < (SELECT COALESCE(total_seats, max_participants, 8) FROM party_rooms WHERE id = room_id)
  AND invitee_id <> auth.uid()
);

-- Default expires_at = now + 60s if NULL
CREATE OR REPLACE FUNCTION public.set_seat_invitation_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + interval '60 seconds';
  END IF;
  IF NEW.status IS NULL THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_set_seat_invitation_defaults ON public.seat_invitations;
CREATE TRIGGER tg_set_seat_invitation_defaults
  BEFORE INSERT ON public.seat_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_seat_invitation_defaults();

-- F. seat_requests anti-tamper
DROP POLICY IF EXISTS u_ins_seat_req ON public.seat_requests;
CREATE POLICY u_ins_seat_req
ON public.seat_requests
FOR INSERT
WITH CHECK (
  auth.uid() = COALESCE(requester_id, user_id)
  AND (status IS NULL OR status = 'pending')
  AND responded_at IS NULL
  AND EXISTS (SELECT 1 FROM party_rooms r WHERE r.id = room_id AND r.is_active = true)
);

DROP POLICY IF EXISTS "Room host can respond to seat requests" ON public.seat_requests;
CREATE POLICY "Room host can respond to seat requests"
ON public.seat_requests
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM party_rooms r WHERE r.id = seat_requests.room_id AND r.host_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM party_rooms r WHERE r.id = seat_requests.room_id AND r.host_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.guard_seat_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;
  IF NEW.room_id IS DISTINCT FROM OLD.room_id THEN
    RAISE EXCEPTION 'room_id immutable';
  END IF;
  IF COALESCE(NEW.requester_id, NEW.user_id) IS DISTINCT FROM COALESCE(OLD.requester_id, OLD.user_id) THEN
    RAISE EXCEPTION 'requester_id immutable';
  END IF;
  IF NEW.seat_position IS DISTINCT FROM OLD.seat_position OR NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
    RAISE EXCEPTION 'seat number immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_seat_request_update ON public.seat_requests;
CREATE TRIGGER tg_guard_seat_request_update
  BEFORE UPDATE ON public.seat_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_seat_request_update();

-- G. Auto-cancel pending seat_requests + close participants when party room ends
CREATE OR REPLACE FUNCTION public.party_room_cleanup_on_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.is_active = true AND NEW.is_active = false)
     OR (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL) THEN
    UPDATE party_room_participants
      SET left_at = COALESCE(left_at, now())
      WHERE room_id = NEW.id AND left_at IS NULL;
    UPDATE seat_requests
      SET status = 'cancelled', responded_at = now()
      WHERE room_id = NEW.id AND status = 'pending';
    UPDATE seat_invitations
      SET status = 'expired'
      WHERE room_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_party_room_cleanup_on_end ON public.party_rooms;
CREATE TRIGGER tg_party_room_cleanup_on_end
  AFTER UPDATE ON public.party_rooms
  FOR EACH ROW EXECUTE FUNCTION public.party_room_cleanup_on_end();

-- H. enter_party_room: re-activate rejoin (clear left_at)
CREATE OR REPLACE FUNCTION public.enter_party_room(
  p_room_id uuid,
  p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room party_rooms%ROWTYPE;
  v_user_level int;
  v_is_banned boolean;
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
    SELECT COALESCE(is_banned, false), COALESCE(user_level,0)
      INTO v_is_banned, v_user_level FROM profiles WHERE id = v_uid;
    IF v_is_banned THEN RAISE EXCEPTION 'You are banned'; END IF;

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
      -- Skip re-charging on rejoin within same session
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

  -- UPSERT: clear left_at on rejoin
  INSERT INTO party_room_participants(room_id, user_id, role, joined_at, left_at)
  VALUES (p_room_id, v_uid, v_role, now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET left_at = NULL,
        joined_at = COALESCE(party_room_participants.joined_at, now()),
        role = CASE WHEN party_room_participants.role = 'host' THEN 'host' ELSE EXCLUDED.role END;

  RETURN jsonb_build_object('ok', true, 'role', v_role);
END;
$$;
