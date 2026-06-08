
-- Phase III.d — Seat invitation accept/decline RPCs (atomic).
-- INSERT policy on seat_invitations already enforces inviter = host (`u_ins_seat_inv`).
-- These RPCs handle the invitee side without RLS gymnastics on party_room_participants.

CREATE OR REPLACE FUNCTION public.accept_seat_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv     public.seat_invitations%ROWTYPE;
  v_room    public.party_rooms%ROWTYPE;
  v_max     int;
  v_taken   boolean;
  v_uid     uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_inv FROM public.seat_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_inv.invitee_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_invitee');
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handled', 'status', v_inv.status);
  END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE public.seat_invitations SET status = 'expired' WHERE id = v_inv.id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  SELECT * INTO v_room FROM public.party_rooms WHERE id = v_inv.room_id FOR UPDATE;
  IF NOT FOUND OR v_room.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_closed');
  END IF;

  v_max := COALESCE(v_room.total_seats, v_room.max_participants, 8);
  IF v_inv.seat_number < 0 OR v_inv.seat_number >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_seat');
  END IF;

  -- Seat occupied?
  SELECT EXISTS (
    SELECT 1 FROM public.party_room_participants
    WHERE room_id = v_inv.room_id
      AND seat_number = v_inv.seat_number
      AND left_at IS NULL
      AND user_id <> v_uid
  ) INTO v_taken;
  IF v_taken THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_taken');
  END IF;

  -- Free any previous seat this user occupied in the room (they can only hold one).
  UPDATE public.party_room_participants
     SET seat_number = NULL, role = 'audience'
   WHERE room_id = v_inv.room_id
     AND user_id = v_uid
     AND seat_number IS NOT NULL
     AND seat_number <> v_inv.seat_number
     AND left_at IS NULL;

  -- Upsert into target seat.
  INSERT INTO public.party_room_participants (room_id, user_id, role, seat_number, joined_at, last_seen_at)
  VALUES (v_inv.room_id, v_uid, 'speaker', v_inv.seat_number, now(), now())
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET
    seat_number   = EXCLUDED.seat_number,
    role          = 'speaker',
    left_at       = NULL,
    last_seen_at  = now();

  -- Mark any pending seat_requests this user had in the room as cancelled.
  UPDATE public.seat_requests
     SET status = 'cancelled'
   WHERE room_id = v_inv.room_id
     AND requester_id = v_uid
     AND status = 'pending';

  UPDATE public.seat_invitations SET status = 'accepted' WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'seat_number', v_inv.seat_number, 'room_id', v_inv.room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_seat_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.seat_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT * INTO v_inv FROM public.seat_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_inv.invitee_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_invitee');
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;
  UPDATE public.seat_invitations SET status = 'declined' WHERE id = v_inv.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_seat_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_seat_invitation(uuid) TO authenticated;
