-- ============================================================
-- R2-Phase D Wave-1: party-seat self-promote block + reel view dedup
-- ============================================================

-- 1) Party seat: block client self-promote of role / seat_number.
-- The RLS policy `a_upd_party_part_self` allows a participant to update their
-- own row (needed for `is_muted` toggles, leave-mark, etc). Without a trigger
-- guard, a participant could `update({ role: 'speaker', seat_number: 0 })` and
-- bypass `approve_seat_request`. We allow these column changes only when:
--   - the caller is the room host, OR
--   - the change comes from a SECURITY DEFINER RPC (auth.uid() = OLD.user_id
--     but the row is being widened by trusted server code — we detect that
--     via a session-scoped GUC the trusted RPCs set).
CREATE OR REPLACE FUNCTION public._guard_party_participant_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_host boolean := false;
  v_trusted boolean := false;
BEGIN
  -- Trusted server context (set by approve_seat_request / kick_party_participant
  -- / party_mute_seat etc. before they UPDATE the row).
  BEGIN
    v_trusted := current_setting('app.party_seat_trusted', true) = '1';
  EXCEPTION WHEN OTHERS THEN
    v_trusted := false;
  END;

  IF v_trusted THEN
    RETURN NEW;
  END IF;

  -- Service role bypass (edge functions running with service_role JWT).
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Is the caller the host of this room?
  SELECT EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = NEW.room_id AND r.host_id = v_uid
  ) INTO v_is_host;

  IF v_is_host THEN
    RETURN NEW;
  END IF;

  -- Non-host caller: forbid changes to role / seat_number.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role change forbidden — use approve_seat_request';
  END IF;
  IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
    RAISE EXCEPTION 'seat change forbidden — use approve_seat_request';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_party_participant_privileged_cols ON public.party_room_participants;
CREATE TRIGGER guard_party_participant_privileged_cols
BEFORE UPDATE ON public.party_room_participants
FOR EACH ROW EXECUTE FUNCTION public._guard_party_participant_privileged_cols();

-- Mark the trusted RPCs as bypassing the guard.
CREATE OR REPLACE FUNCTION public.approve_seat_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_req record;
  v_room record;
  v_existing_occupant uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  PERFORM set_config('app.party_seat_trusted', '1', true);

  SELECT * INTO v_req FROM public.seat_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handled', 'status', v_req.status);
  END IF;

  SELECT * INTO v_room FROM public.party_rooms WHERE id = v_req.room_id FOR UPDATE;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  SELECT user_id INTO v_existing_occupant
  FROM public.party_room_participants
  WHERE room_id = v_req.room_id
    AND seat_number = v_req.seat_number
    AND left_at IS NULL
  FOR UPDATE;

  IF FOUND AND v_existing_occupant IS NOT NULL AND v_existing_occupant <> v_req.user_id THEN
    UPDATE public.seat_requests
      SET status = 'rejected', responded_at = now()
      WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', false, 'error', 'seat_taken', 'occupant', v_existing_occupant);
  END IF;

  INSERT INTO public.party_room_participants (room_id, user_id, role, seat_number, is_muted, joined_at, left_at)
  VALUES (v_req.room_id, v_req.user_id, 'speaker', v_req.seat_number, false, now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET seat_number = EXCLUDED.seat_number,
        role = 'speaker',
        left_at = NULL,
        is_muted = false;

  UPDATE public.seat_requests
    SET status = 'approved', responded_at = now()
    WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'room_id', v_req.room_id, 'user_id', v_req.user_id, 'seat_number', v_req.seat_number);
END;
$function$;

-- ============================================================
-- 2) Reel view dedup (R2-H8) — 1 view per (user, reel) per day.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reel_views (
  reel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  viewed_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, user_id, viewed_date)
);

GRANT SELECT, INSERT ON public.reel_views TO authenticated;
GRANT ALL ON public.reel_views TO service_role;
ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;

-- Self only — viewer rows are insert-only; users can read their own history.
CREATE POLICY reel_views_self_read ON public.reel_views
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY reel_views_self_insert ON public.reel_views
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reel_views_user_date
  ON public.reel_views (user_id, viewed_date DESC);

-- Replace increment_reel_view: only bump counters when a fresh dedup row
-- actually inserts. Anonymous viewers (no auth.uid()) still bump (best-effort).
CREATE OR REPLACE FUNCTION public.increment_reel_view(reel_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inserted boolean := true;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  -- Auth viewers: insert a dedup row; if it conflicts, this is a repeat view.
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.reel_views (reel_id, user_id, viewed_date)
    VALUES (reel_uuid, v_uid, v_today)
    ON CONFLICT (reel_id, user_id, viewed_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted::int = 0 THEN
      RETURN; -- already counted today
    END IF;
  END IF;

  PERFORM set_config('app.reel_counter_update', '1', true);
  UPDATE public.reels
  SET view_count  = COALESCE(view_count, 0) + 1,
      views_count = COALESCE(views_count, 0) + 1
  WHERE id = reel_uuid
    AND COALESCE(is_active, true) = true
    AND COALESCE(is_approved, true) = true
    AND COALESCE(is_public, true) = true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_reel_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_reel_view(uuid) TO anon, authenticated;
