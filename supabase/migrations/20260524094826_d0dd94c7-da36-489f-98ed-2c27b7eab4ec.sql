
-- =====================================================
-- PARTY ROOM SECTION #12 PASS-1 DEEP AUDIT
-- =====================================================

-- 1. password_hash column + REVOKE plaintext password
ALTER TABLE public.party_rooms
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Backfill existing plaintext passwords (if any) into bcrypt hashes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, password FROM public.party_rooms
           WHERE password IS NOT NULL AND password <> '' AND password_hash IS NULL LOOP
    UPDATE public.party_rooms
      SET password_hash = extensions.crypt(r.password, extensions.gen_salt('bf'))
      WHERE id = r.id;
  END LOOP;
END $$;

REVOKE SELECT (password), INSERT (password), UPDATE (password)
  ON public.party_rooms FROM anon, authenticated;

-- 2. guard_party_room_fields trigger
CREATE OR REPLACE FUNCTION public.guard_party_room_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins/service role bypass
  IF auth.uid() IS NULL OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- Immutable fields
  IF NEW.host_id IS DISTINCT FROM OLD.host_id THEN
    RAISE EXCEPTION 'host_id immutable';
  END IF;
  IF NEW.entry_fee IS DISTINCT FROM OLD.entry_fee THEN
    RAISE EXCEPTION 'entry_fee cannot be changed after room creation';
  END IF;
  IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
    RAISE EXCEPTION 'country_code immutable';
  END IF;
  IF NEW.room_code IS DISTINCT FROM OLD.room_code THEN
    RAISE EXCEPTION 'room_code immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at immutable';
  END IF;

  -- Anti-resurrection: cannot flip is_active false -> true
  IF OLD.is_active = false AND NEW.is_active = true THEN
    RAISE EXCEPTION 'Cannot reopen an ended party room';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_party_room_fields ON public.party_rooms;
CREATE TRIGGER tg_guard_party_room_fields
  BEFORE UPDATE ON public.party_rooms
  FOR EACH ROW EXECUTE FUNCTION public.guard_party_room_fields();

-- 3. Tighten SELECT — hide ended rooms from non-host non-admin
DROP POLICY IF EXISTS "Authenticated users can view active party rooms" ON public.party_rooms;
CREATE POLICY "Authenticated users can view active party rooms"
ON public.party_rooms
FOR SELECT
USING (
  is_active = true
  OR host_id = auth.uid()
  OR auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = true)
);

-- 4. Hosts can update only while active
DROP POLICY IF EXISTS "Hosts can update their own party rooms" ON public.party_rooms;
CREATE POLICY "Hosts can update their own party rooms"
ON public.party_rooms
FOR UPDATE
USING (host_id = auth.uid() AND is_active = true)
WITH CHECK (host_id = auth.uid());

-- 5. enforce_party_room_insert_eligibility
CREATE OR REPLACE FUNCTION public.enforce_party_room_insert_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_banned boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Force host_id to caller (block spoofing)
  NEW.host_id := v_uid;

  -- Banned at profile level?
  SELECT COALESCE(is_banned, false) INTO v_is_banned FROM profiles WHERE id = v_uid;
  IF v_is_banned THEN
    RAISE EXCEPTION 'Banned users cannot create party rooms';
  END IF;

  -- Active live-ban?
  IF EXISTS (
    SELECT 1 FROM live_bans
    WHERE user_id = v_uid
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'You are temporarily banned from creating rooms';
  END IF;

  -- Sanitize start state
  NEW.is_active := true;
  NEW.ended_at := NULL;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_enforce_party_room_insert ON public.party_rooms;
CREATE TRIGGER tg_enforce_party_room_insert
  BEFORE INSERT ON public.party_rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_party_room_insert_eligibility();

-- 6. Unique active room per host
CREATE UNIQUE INDEX IF NOT EXISTS uniq_party_rooms_active_host
  ON public.party_rooms(host_id)
  WHERE is_active = true;

-- 7. enter_party_room RPC (atomic gating + entry fee)
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO v_room FROM party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.is_active = false THEN
    RAISE EXCEPTION 'Room not found or not active';
  END IF;

  -- Host always allowed in own room
  IF v_room.host_id = v_uid THEN
    INSERT INTO party_room_participants(room_id, user_id, role, joined_at, left_at)
    VALUES (p_room_id, v_uid, 'host', now(), NULL)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'role', 'host');
  END IF;

  -- Banned globally?
  SELECT COALESCE(is_banned, false), COALESCE(user_level,0)
    INTO v_is_banned, v_user_level FROM profiles WHERE id = v_uid;
  IF v_is_banned THEN
    RAISE EXCEPTION 'You are banned';
  END IF;

  -- Active live-ban
  IF EXISTS (
    SELECT 1 FROM live_bans
    WHERE user_id = v_uid AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'You are temporarily banned';
  END IF;

  -- Blocked by host
  IF EXISTS (
    SELECT 1 FROM blocked_users
    WHERE blocker_id = v_room.host_id AND blocked_id = v_uid
  ) OR EXISTS (
    SELECT 1 FROM user_blocks
    WHERE blocker_id = v_room.host_id AND blocked_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are blocked from this room';
  END IF;

  -- Level gate
  IF COALESCE(v_room.min_level,0) > 0 AND v_user_level < v_room.min_level THEN
    RAISE EXCEPTION 'Level % required to enter', v_room.min_level;
  END IF;

  -- Password / lock
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

  -- Capacity (active participants only)
  SELECT COUNT(*) INTO v_count
    FROM party_room_participants
    WHERE room_id = p_room_id AND left_at IS NULL;
  IF v_count >= COALESCE(v_room.max_participants, 10) THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  -- Entry fee atomic
  IF COALESCE(v_room.entry_fee,0) > 0 THEN
    SELECT COALESCE(coins,0) INTO v_coins FROM profiles WHERE id = v_uid FOR UPDATE;
    IF v_coins < v_room.entry_fee THEN
      RAISE EXCEPTION 'Insufficient coins for entry fee';
    END IF;
    UPDATE profiles SET coins = coins - v_room.entry_fee WHERE id = v_uid;
  END IF;

  INSERT INTO party_room_participants(room_id, user_id, role, joined_at, left_at)
  VALUES (p_room_id, v_uid, 'listener', now(), NULL)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'role', 'listener');
END;
$$;

REVOKE ALL ON FUNCTION public.enter_party_room(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_party_room(uuid, text) TO authenticated;

-- 8. Tighten direct INSERT into party_room_participants
DROP POLICY IF EXISTS a_ins_party_part ON public.party_room_participants;
CREATE POLICY a_ins_party_part
ON public.party_room_participants
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM party_rooms r
    WHERE r.id = room_id
      AND r.is_active = true
      AND COALESCE(r.is_locked,false) = false
      AND r.password_hash IS NULL
      AND COALESCE(r.min_level,0) = 0
      AND COALESCE(r.entry_fee,0) = 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM live_bans lb
    WHERE lb.user_id = auth.uid()
      AND lb.is_active = true
      AND (lb.expires_at IS NULL OR lb.expires_at > now())
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_users b
    JOIN party_rooms r ON r.id = room_id
    WHERE b.blocker_id = r.host_id AND b.blocked_id = auth.uid()
  )
);

-- 9. Tighten party_room_messages INSERT (must be active participant + not banned)
DROP POLICY IF EXISTS a_ins_party_msg ON public.party_room_messages;
CREATE POLICY a_ins_party_msg
ON public.party_room_messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM party_room_participants p
    WHERE p.room_id = party_room_messages.room_id
      AND p.user_id = auth.uid()
      AND p.left_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM live_bans lb
    WHERE lb.user_id = auth.uid()
      AND lb.is_active = true
      AND (lb.expires_at IS NULL OR lb.expires_at > now())
  )
);
