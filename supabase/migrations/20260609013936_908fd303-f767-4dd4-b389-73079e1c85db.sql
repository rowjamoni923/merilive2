
-- ===========================================================================
-- PR-2.5 Party Room functional gaps (research-locked, items #4-#9)
-- Items #7 lobby search and #10 preview-before-pay are pure-frontend; #8
-- attribution edge case is fixed in TS. This migration is the backend layer.
-- ===========================================================================

-- ---------- 1. Schema additions ----------

ALTER TABLE public.party_rooms
  ADD COLUMN IF NOT EXISTS host_reconnect_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS gift_split_config jsonb NOT NULL
      DEFAULT '{"host_pct":60,"speakers_pct":40}'::jsonb;

ALTER TABLE public.party_room_participants
  ADD COLUMN IF NOT EXISTS muted_by_host boolean NOT NULL DEFAULT false;

-- Reduce default seat invitation TTL from 60s -> 30s (TRTC industry default).
CREATE OR REPLACE FUNCTION public.set_seat_invitation_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + interval '30 seconds';
  END IF;
  IF NEW.status IS NULL THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------- 2. Backfill + uniqueness for room_code ----------

-- Helper: 6-char uppercase alphanumeric (no I/O/0/1 to avoid confusion)
CREATE OR REPLACE FUNCTION public.generate_party_room_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exists boolean;
  v_tries int := 0;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.party_rooms WHERE room_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_tries := v_tries + 1;
    IF v_tries > 20 THEN
      RAISE EXCEPTION 'Could not generate unique room_code after 20 attempts';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$$;

-- Backfill any rooms with NULL room_code
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.party_rooms WHERE room_code IS NULL LOOP
    UPDATE public.party_rooms
       SET room_code = public.generate_party_room_code()
     WHERE id = r.id;
  END LOOP;
END $$;

-- Now enforce uniqueness + index for lookup
CREATE UNIQUE INDEX IF NOT EXISTS party_rooms_room_code_unique
  ON public.party_rooms(room_code) WHERE room_code IS NOT NULL;

-- Auto-assign room_code on new rooms (BEFORE INSERT, runs before guard)
CREATE OR REPLACE FUNCTION public.set_party_room_code_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.room_code IS NULL THEN
    NEW.room_code := public.generate_party_room_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_set_party_room_code_default ON public.party_rooms;
CREATE TRIGGER tg_set_party_room_code_default
  BEFORE INSERT ON public.party_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_party_room_code_default();

-- ---------- 3. Seat locks (per-seat, TRTC-pattern) ----------

CREATE TABLE IF NOT EXISTS public.party_room_seat_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  seat_number integer NOT NULL CHECK (seat_number >= 0 AND seat_number <= 19),
  is_locked boolean NOT NULL DEFAULT true,
  forbid_audio boolean NOT NULL DEFAULT false,
  forbid_video boolean NOT NULL DEFAULT false,
  locked_by uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, seat_number)
);

GRANT SELECT ON public.party_room_seat_locks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_room_seat_locks TO authenticated;
GRANT ALL ON public.party_room_seat_locks TO service_role;

ALTER TABLE public.party_room_seat_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seat_locks_read_all"
  ON public.party_room_seat_locks FOR SELECT
  USING (true);

CREATE POLICY "seat_locks_host_write"
  ON public.party_room_seat_locks FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.party_rooms r
            WHERE r.id = party_room_seat_locks.room_id AND r.host_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.party_rooms r
            WHERE r.id = party_room_seat_locks.room_id AND r.host_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS party_room_seat_locks_room_idx
  ON public.party_room_seat_locks(room_id);

-- ---------- 4. Adjust guard_party_room_fields to allow PR-2.5 mutations ----------

CREATE OR REPLACE FUNCTION public.guard_party_room_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer_ok text := current_setting('app.party_host_transfer_ok', true);
BEGIN
  -- Admins/service role bypass
  IF auth.uid() IS NULL OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- PR-2.5: host_id is immutable EXCEPT during transfer_party_host RPC,
  -- which sets a transaction-local GUC before mutating.
  IF NEW.host_id IS DISTINCT FROM OLD.host_id
     AND COALESCE(v_transfer_ok, '') <> 'true' THEN
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
$function$;

-- ---------- 5. RPC: transfer_party_host (manual + auto promotion) ----------

CREATE OR REPLACE FUNCTION public.transfer_party_host(
  p_room_id uuid,
  p_new_host_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room public.party_rooms%ROWTYPE;
  v_target_active boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_new_host_id IS NULL OR p_new_host_id = v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  SELECT * INTO v_room FROM public.party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  -- Target must currently be in the room and not left
  SELECT EXISTS(
    SELECT 1 FROM public.party_room_participants
     WHERE room_id = p_room_id AND user_id = p_new_host_id AND left_at IS NULL
  ) INTO v_target_active;
  IF NOT v_target_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_in_room');
  END IF;

  -- Allow the host_id mutation by guard_party_room_fields
  PERFORM set_config('app.party_host_transfer_ok', 'true', true);

  -- Promote target to host on seat 0
  UPDATE public.party_room_participants
     SET role = 'speaker', seat_number = COALESCE(seat_number, 1)
   WHERE room_id = p_room_id AND user_id = v_caller AND left_at IS NULL;

  UPDATE public.party_room_participants
     SET role = 'host', seat_number = 0, muted_by_host = false
   WHERE room_id = p_room_id AND user_id = p_new_host_id AND left_at IS NULL;

  UPDATE public.party_rooms
     SET host_id = p_new_host_id, host_reconnect_deadline = NULL, updated_at = now()
   WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'room_id', p_room_id, 'new_host_id', p_new_host_id);
END;
$$;

-- ---------- 6. Trigger + RPC for host disconnect -> 60s grace ----------

-- When the current host's participant row flips to left_at != NULL,
-- set host_reconnect_deadline = now() + 60s instead of immediate close.
CREATE OR REPLACE FUNCTION public.tg_party_host_disconnect_grace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_host boolean;
BEGIN
  IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
    SELECT (host_id = NEW.user_id) INTO v_is_host
      FROM public.party_rooms WHERE id = NEW.room_id;
    IF COALESCE(v_is_host, false) THEN
      UPDATE public.party_rooms
         SET host_reconnect_deadline = now() + interval '60 seconds'
       WHERE id = NEW.room_id
         AND host_reconnect_deadline IS NULL
         AND is_active = true;
    END IF;
  ELSIF OLD.left_at IS NOT NULL AND NEW.left_at IS NULL THEN
    -- Host re-joined within grace window — clear deadline
    SELECT (host_id = NEW.user_id) INTO v_is_host
      FROM public.party_rooms WHERE id = NEW.room_id;
    IF COALESCE(v_is_host, false) THEN
      UPDATE public.party_rooms
         SET host_reconnect_deadline = NULL
       WHERE id = NEW.room_id AND is_active = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_party_host_disconnect_grace ON public.party_room_participants;
CREATE TRIGGER trg_party_host_disconnect_grace
  AFTER UPDATE OF left_at ON public.party_room_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_party_host_disconnect_grace();

-- Sweep job (called by pg_cron): for each expired deadline, auto-promote
-- lowest-numbered occupied non-host speaker to host. If no candidate, close room.
CREATE OR REPLACE FUNCTION public.sweep_party_host_reconnect()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_new_host uuid;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT id, host_id FROM public.party_rooms
     WHERE is_active = true
       AND host_reconnect_deadline IS NOT NULL
       AND host_reconnect_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT user_id INTO v_new_host
      FROM public.party_room_participants
     WHERE room_id = r.id
       AND left_at IS NULL
       AND user_id <> r.host_id
       AND seat_number IS NOT NULL
       AND seat_number > 0
     ORDER BY seat_number ASC
     LIMIT 1;

    PERFORM set_config('app.party_host_transfer_ok', 'true', true);

    IF v_new_host IS NOT NULL THEN
      UPDATE public.party_room_participants
         SET role = 'host', seat_number = 0, muted_by_host = false
       WHERE room_id = r.id AND user_id = v_new_host AND left_at IS NULL;
      UPDATE public.party_rooms
         SET host_id = v_new_host, host_reconnect_deadline = NULL, updated_at = now()
       WHERE id = r.id;
    ELSE
      -- No candidate — close room
      UPDATE public.party_rooms
         SET is_active = false, ended_at = now(), host_reconnect_deadline = NULL
       WHERE id = r.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_party_host_reconnect() TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_party_host(uuid, uuid) TO authenticated;

-- ---------- 7. RPC: mute_all_speakers / unmute_all_speakers ----------

CREATE OR REPLACE FUNCTION public.mute_all_speakers(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room public.party_rooms%ROWTYPE;
  v_updated int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT * INTO v_room FROM public.party_rooms WHERE id = p_room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  UPDATE public.party_room_participants
     SET muted_by_host = true, is_muted = true
   WHERE room_id = p_room_id
     AND left_at IS NULL
     AND user_id <> v_room.host_id
     AND seat_number IS NOT NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'muted', v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.unmute_all_speakers(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room public.party_rooms%ROWTYPE;
  v_updated int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT * INTO v_room FROM public.party_rooms WHERE id = p_room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  UPDATE public.party_room_participants
     SET muted_by_host = false, is_muted = false
   WHERE room_id = p_room_id
     AND left_at IS NULL
     AND user_id <> v_room.host_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'unmuted', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mute_all_speakers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmute_all_speakers(uuid) TO authenticated;

-- ---------- 8. RPC: set_seat_lock (per-seat) ----------

CREATE OR REPLACE FUNCTION public.set_seat_lock(
  p_room_id uuid,
  p_seat_number integer,
  p_locked boolean,
  p_forbid_audio boolean DEFAULT false,
  p_forbid_video boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room public.party_rooms%ROWTYPE;
  v_max int;
  v_occupant uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT * INTO v_room FROM public.party_rooms WHERE id = p_room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  v_max := COALESCE(v_room.total_seats, v_room.max_participants, 8);
  IF p_seat_number < 1 OR p_seat_number >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_seat');
  END IF;

  IF p_locked THEN
    -- Kick existing occupant (if any, non-host) before locking
    SELECT user_id INTO v_occupant
      FROM public.party_room_participants
     WHERE room_id = p_room_id
       AND seat_number = p_seat_number
       AND left_at IS NULL
       AND user_id <> v_room.host_id;
    IF v_occupant IS NOT NULL THEN
      UPDATE public.party_room_participants
         SET seat_number = NULL, role = 'audience'
       WHERE room_id = p_room_id AND user_id = v_occupant AND left_at IS NULL;
    END IF;

    INSERT INTO public.party_room_seat_locks (
      room_id, seat_number, is_locked, forbid_audio, forbid_video, locked_by
    ) VALUES (
      p_room_id, p_seat_number, true,
      COALESCE(p_forbid_audio, false), COALESCE(p_forbid_video, false),
      v_caller
    )
    ON CONFLICT (room_id, seat_number) DO UPDATE
      SET is_locked = true,
          forbid_audio = EXCLUDED.forbid_audio,
          forbid_video = EXCLUDED.forbid_video,
          locked_by = EXCLUDED.locked_by,
          updated_at = now();
  ELSE
    DELETE FROM public.party_room_seat_locks
     WHERE room_id = p_room_id AND seat_number = p_seat_number;
  END IF;

  RETURN jsonb_build_object('ok', true, 'seat_number', p_seat_number, 'locked', p_locked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_seat_lock(uuid, integer, boolean, boolean, boolean) TO authenticated;

-- Guard: block accept_seat_invitation + seat_requests if target seat is locked.
-- We extend by wrapping accept_seat_invitation; the simplest path is a
-- BEFORE INSERT guard on party_room_participants when seat_number is set.
CREATE OR REPLACE FUNCTION public.guard_seat_lock_on_take()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_locked boolean;
  v_host uuid;
BEGIN
  IF NEW.seat_number IS NULL OR NEW.left_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Allow host on seat 0
  SELECT host_id INTO v_host FROM public.party_rooms WHERE id = NEW.room_id;
  IF NEW.user_id = v_host THEN RETURN NEW; END IF;

  SELECT is_locked INTO v_locked
    FROM public.party_room_seat_locks
   WHERE room_id = NEW.room_id AND seat_number = NEW.seat_number;
  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'SEAT_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_seat_lock_on_take_ins ON public.party_room_participants;
CREATE TRIGGER trg_guard_seat_lock_on_take_ins
  BEFORE INSERT ON public.party_room_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_seat_lock_on_take();

DROP TRIGGER IF EXISTS trg_guard_seat_lock_on_take_upd ON public.party_room_participants;
CREATE TRIGGER trg_guard_seat_lock_on_take_upd
  BEFORE UPDATE OF seat_number ON public.party_room_participants
  FOR EACH ROW
  WHEN (NEW.seat_number IS DISTINCT FROM OLD.seat_number AND NEW.seat_number IS NOT NULL)
  EXECUTE FUNCTION public.guard_seat_lock_on_take();

-- ---------- 9. RPC: record_party_gift_split (60/40 default) ----------

CREATE OR REPLACE FUNCTION public.record_party_gift_split(
  p_room_id uuid,
  p_sender_id uuid,
  p_gift_id uuid,
  p_total_coins bigint,
  p_total_beans bigint,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.party_rooms%ROWTYPE;
  v_host_pct int;
  v_speakers_pct int;
  v_host_beans bigint;
  v_speakers_pool bigint;
  v_speaker_count int;
  v_per_speaker bigint;
  v_speakers uuid[];
  v_uid uuid;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_sender_id IS NULL OR p_total_beans < 0 OR p_total_coins < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  SELECT * INTO v_room FROM public.party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;

  v_host_pct := COALESCE((v_room.gift_split_config->>'host_pct')::int, 60);
  v_speakers_pct := COALESCE((v_room.gift_split_config->>'speakers_pct')::int, 40);
  IF v_host_pct + v_speakers_pct <> 100 THEN
    v_host_pct := 60; v_speakers_pct := 40;
  END IF;

  -- Collect occupied non-host speakers
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[]) INTO v_speakers
    FROM public.party_room_participants
   WHERE room_id = p_room_id
     AND left_at IS NULL
     AND seat_number IS NOT NULL
     AND user_id <> v_room.host_id;

  v_speaker_count := COALESCE(array_length(v_speakers, 1), 0);

  IF v_speaker_count = 0 THEN
    v_host_beans := p_total_beans;
    v_per_speaker := 0;
    v_speakers_pool := 0;
  ELSE
    v_host_beans := (p_total_beans * v_host_pct) / 100;
    v_speakers_pool := p_total_beans - v_host_beans;
    v_per_speaker := v_speakers_pool / v_speaker_count;
    -- Any rounding remainder folds back to host
    v_host_beans := v_host_beans + (v_speakers_pool - (v_per_speaker * v_speaker_count));
  END IF;

  -- Write host share
  INSERT INTO public.gift_transactions (
    sender_id, receiver_id, gift_id, party_room_id, room_id,
    coin_amount, coin_cost, coin_value, total_coins, receiver_beans, quantity,
    sender_type, idempotency_key
  ) VALUES (
    p_sender_id, v_room.host_id, p_gift_id, p_room_id, p_room_id,
    p_total_coins, p_total_coins, p_total_coins, p_total_coins, v_host_beans, 1,
    'user',
    CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || ':host' ELSE NULL END
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Write each speaker share
  IF v_per_speaker > 0 THEN
    FOREACH v_uid IN ARRAY v_speakers LOOP
      INSERT INTO public.gift_transactions (
        sender_id, receiver_id, gift_id, party_room_id, room_id,
        coin_amount, coin_cost, coin_value, total_coins, receiver_beans, quantity,
        sender_type, idempotency_key
      ) VALUES (
        p_sender_id, v_uid, p_gift_id, p_room_id, p_room_id,
        0, 0, 0, 0, v_per_speaker, 1,
        'user',
        CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || ':' || v_uid::text ELSE NULL END
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'host_id', v_room.host_id,
    'host_beans', v_host_beans,
    'per_speaker_beans', v_per_speaker,
    'speaker_count', v_speaker_count,
    'speakers', to_jsonb(v_speakers)
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_party_gift_split(uuid, uuid, uuid, bigint, bigint, text) TO authenticated;

-- Idempotency key index (if not already partial-unique). Best-effort.
CREATE UNIQUE INDEX IF NOT EXISTS gift_transactions_idempotency_key_unique
  ON public.gift_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
