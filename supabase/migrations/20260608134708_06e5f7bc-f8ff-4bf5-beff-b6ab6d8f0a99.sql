CREATE OR REPLACE FUNCTION public.party_mute_seat(p_room_id uuid, p_target_user_id uuid, p_muted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_host uuid;
BEGIN
  IF v_caller IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT host_id INTO v_host FROM public.party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_host IS NULL THEN RETURN jsonb_build_object('ok',false,'error','room_not_found'); END IF;
  IF v_host <> v_caller THEN RETURN jsonb_build_object('ok',false,'error','not_host'); END IF;
  IF p_target_user_id = v_host THEN RETURN jsonb_build_object('ok',false,'error','cannot_mute_host'); END IF;
  UPDATE public.party_room_participants SET is_muted = p_muted
    WHERE room_id = p_room_id AND user_id = p_target_user_id AND left_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','participant_not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'muted',p_muted);
END; $$;
REVOKE ALL ON FUNCTION public.party_mute_seat(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_mute_seat(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.party_mute_seat(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.party_mute_all(p_room_id uuid, p_muted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_host uuid; v_count int;
BEGIN
  IF v_caller IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT host_id INTO v_host FROM public.party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_host IS NULL THEN RETURN jsonb_build_object('ok',false,'error','room_not_found'); END IF;
  IF v_host <> v_caller THEN RETURN jsonb_build_object('ok',false,'error','not_host'); END IF;
  WITH upd AS (
    UPDATE public.party_room_participants SET is_muted = p_muted
    WHERE room_id = p_room_id AND user_id <> v_host AND left_at IS NULL
      AND seat_number IS NOT NULL AND is_muted IS DISTINCT FROM p_muted
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM upd;
  RETURN jsonb_build_object('ok',true,'muted',p_muted,'count',v_count);
END; $$;
REVOKE ALL ON FUNCTION public.party_mute_all(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_mute_all(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.party_mute_all(uuid, boolean) TO service_role;