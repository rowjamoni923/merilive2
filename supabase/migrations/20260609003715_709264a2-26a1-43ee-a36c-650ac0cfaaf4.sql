-- PR-1: Party Room security hardening
-- 1) Block self-escalation: viewer cannot change own role/seat_number
-- 2) kick_party_participant RPC (also writes live_bans so kicked user cannot rejoin)
-- 3) reject_seat_request RPC (atomic, host-only)
-- 4) Rate-limit pending seat requests (max 1 per user per room)

-- =====================================================================
-- 1. Self-update column whitelist trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.party_room_participants_block_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_host boolean;
BEGIN
  -- Service role / NULL auth (server-side RPCs run as SECURITY DEFINER) bypass
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- If the caller is the host of this room, allow any change
  SELECT EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = NEW.room_id AND r.host_id = v_caller
  ) INTO v_is_host;

  IF v_is_host THEN
    RETURN NEW;
  END IF;

  -- Caller is updating their own row (RLS a_upd_party_part_self path).
  -- Block any change to role, seat_number. Only is_muted, left_at, last_seen_at allowed.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'self_role_change_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
    RAISE EXCEPTION 'self_seat_change_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'immutable_field_change_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_self_escalation ON public.party_room_participants;
CREATE TRIGGER trg_block_self_escalation
  BEFORE UPDATE ON public.party_room_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.party_room_participants_block_self_escalation();

-- =====================================================================
-- 2. kick_party_participant RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.kick_party_participant(
  p_room_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'Kicked by host',
  p_ban_minutes integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room record;
  v_target_role text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  SELECT * INTO v_room FROM public.party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;
  IF v_room.host_id = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_kick_host');
  END IF;

  SELECT role INTO v_target_role
  FROM public.party_room_participants
  WHERE room_id = p_room_id AND user_id = p_user_id AND left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  -- Mark participant as left
  UPDATE public.party_room_participants
    SET left_at = now()
    WHERE room_id = p_room_id AND user_id = p_user_id AND left_at IS NULL;

  -- Cancel any pending seat requests
  UPDATE public.seat_requests
    SET status = 'cancelled', responded_at = now()
    WHERE room_id = p_room_id
      AND COALESCE(requester_id, user_id) = p_user_id
      AND status = 'pending';

  -- Insert ban record so user cannot re-enter this or other rooms during ban window
  INSERT INTO public.live_bans (
    user_id, banned_by, reason, ban_type, ban_duration_hours,
    expires_at, is_active, ban_start, ban_end, severity, violation_type
  )
  VALUES (
    p_user_id,
    v_caller,
    COALESCE(p_reason, 'Kicked by host'),
    CASE WHEN p_ban_minutes >= 1440 THEN 'temporary' ELSE 'short' END,
    GREATEST(1, p_ban_minutes / 60),
    now() + (GREATEST(1, p_ban_minutes) * interval '1 minute'),
    true,
    now(),
    now() + (GREATEST(1, p_ban_minutes) * interval '1 minute'),
    'low',
    'kicked_from_party'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', p_room_id,
    'user_id', p_user_id,
    'expires_at', (now() + (GREATEST(1, p_ban_minutes) * interval '1 minute'))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_party_participant(uuid, uuid, text, integer) TO authenticated;

-- =====================================================================
-- 3. reject_seat_request RPC (atomic, host-only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reject_seat_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_req record;
  v_room record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_req FROM public.seat_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handled', 'status', v_req.status);
  END IF;

  SELECT * INTO v_room FROM public.party_rooms WHERE id = v_req.room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_active');
  END IF;
  IF v_room.host_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;

  UPDATE public.seat_requests
    SET status = 'rejected', responded_at = now()
    WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_req.room_id,
    'requester_id', COALESCE(v_req.requester_id, v_req.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_seat_request(uuid) TO authenticated;

-- =====================================================================
-- 4. Rate-limit pending seat requests: at most 1 pending per (room, user)
-- =====================================================================
-- Cancel any duplicate pending requests first
UPDATE public.seat_requests s
   SET status = 'cancelled', responded_at = now()
 WHERE status = 'pending'
   AND id NOT IN (
     SELECT DISTINCT ON (room_id, COALESCE(requester_id, user_id)) id
       FROM public.seat_requests
      WHERE status = 'pending'
      ORDER BY room_id, COALESCE(requester_id, user_id), created_at DESC
   );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_seat_request_per_user
  ON public.seat_requests (room_id, COALESCE(requester_id, user_id))
  WHERE status = 'pending';