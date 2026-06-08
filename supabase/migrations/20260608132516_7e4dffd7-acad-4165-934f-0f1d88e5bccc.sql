
-- Phase III.a: Party Room P0 schema + race fixes
-- R2: Add background_id column (no FK because party_room_backgrounds has no PK on id)
ALTER TABLE public.party_rooms
  ADD COLUMN IF NOT EXISTS background_id uuid;

CREATE OR REPLACE FUNCTION public.approve_seat_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_req record;
  v_room record;
  v_existing_occupant uuid;
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
$$;

REVOKE ALL ON FUNCTION public.approve_seat_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_seat_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_seat_request(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.transfer_party_host(p_room_id uuid, p_new_host_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room record;
  v_new_host_active boolean;
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

  SELECT true INTO v_new_host_active
  FROM public.party_room_participants
  WHERE room_id = p_room_id AND user_id = p_new_host_id AND left_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_host_not_in_room');
  END IF;

  UPDATE public.party_room_participants
    SET role = 'speaker'
    WHERE room_id = p_room_id AND user_id = v_caller;

  UPDATE public.party_room_participants
    SET role = 'host', is_muted = false
    WHERE room_id = p_room_id AND user_id = p_new_host_id;

  UPDATE public.party_rooms SET host_id = p_new_host_id WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'room_id', p_room_id, 'old_host', v_caller, 'new_host', p_new_host_id);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_party_host(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_party_host(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_party_host(uuid, uuid) TO service_role;
