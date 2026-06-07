-- F1: stream_viewers INSERT → system_join message in stream_chat
CREATE OR REPLACE FUNCTION public.tg_stream_viewers_announce_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_id uuid;
  v_recent_count int;
BEGIN
  SELECT host_id INTO v_host_id FROM public.live_streams WHERE id = NEW.stream_id;
  IF v_host_id = NEW.viewer_id THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.stream_chat
  WHERE stream_id = NEW.stream_id
    AND user_id = NEW.viewer_id
    AND message_type = 'system_join'
    AND created_at > now() - interval '30 seconds';

  IF v_recent_count > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stream_chat (stream_id, user_id, message, message_type)
  VALUES (NEW.stream_id, NEW.viewer_id, 'joined the live room', 'system_join');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_stream_viewers_announce_join failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stream_viewers_announce_join ON public.stream_viewers;
CREATE TRIGGER trg_stream_viewers_announce_join
AFTER INSERT ON public.stream_viewers
FOR EACH ROW
EXECUTE FUNCTION public.tg_stream_viewers_announce_join();

-- F2: party_room_participants INSERT → join message in party_room_messages
CREATE OR REPLACE FUNCTION public.tg_party_participants_announce_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_id uuid;
  v_recent_count int;
BEGIN
  SELECT host_id INTO v_host_id FROM public.party_rooms WHERE id = NEW.room_id;
  IF v_host_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.party_room_messages
  WHERE room_id = NEW.room_id
    AND user_id = NEW.user_id
    AND message_type = 'join'
    AND created_at > now() - interval '30 seconds';

  IF v_recent_count > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.party_room_messages (room_id, user_id, content, message_type)
  VALUES (NEW.room_id, NEW.user_id, 'joined the room', 'join');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_party_participants_announce_join failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_party_participants_announce_join ON public.party_room_participants;
CREATE TRIGGER trg_party_participants_announce_join
AFTER INSERT ON public.party_room_participants
FOR EACH ROW
EXECUTE FUNCTION public.tg_party_participants_announce_join();

-- F3: seat_requests INSERT (pending) → seat_request message in party_room_messages
CREATE OR REPLACE FUNCTION public.tg_seat_requests_announce()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat int;
  v_requester uuid;
  v_recent_count int;
  v_seat_display int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  v_requester := COALESCE(NEW.requester_id, NEW.user_id);
  v_seat := COALESCE(NEW.seat_position, NEW.seat_number);
  v_seat_display := v_seat + 1;

  IF v_requester IS NULL OR v_seat IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.party_room_messages
  WHERE room_id = NEW.room_id
    AND user_id = v_requester
    AND message_type = 'seat_request'
    AND created_at > now() - interval '30 seconds';

  IF v_recent_count > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.party_room_messages (room_id, user_id, content, message_type)
  VALUES (NEW.room_id, v_requester, 'requested Seat ' || v_seat_display::text, 'seat_request');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_seat_requests_announce failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_requests_announce ON public.seat_requests;
CREATE TRIGGER trg_seat_requests_announce
AFTER INSERT ON public.seat_requests
FOR EACH ROW
EXECUTE FUNCTION public.tg_seat_requests_announce();