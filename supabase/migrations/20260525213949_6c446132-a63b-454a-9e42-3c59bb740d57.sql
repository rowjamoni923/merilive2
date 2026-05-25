CREATE OR REPLACE FUNCTION public.create_party_room(p_name text, p_room_type text, p_game_mode text DEFAULT NULL::text, p_password text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limits jsonb;
  v_total int;
  v_max int;
  v_trim_name text;
  v_pass text;
  v_hash text;
  v_locked boolean;
  v_type text;
  new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trim_name := trim(coalesce(p_name, ''));
  IF v_trim_name = '' THEN v_trim_name := 'Party Room'; END IF;
  IF length(v_trim_name) > 80 THEN v_trim_name := left(v_trim_name, 80); END IF;

  v_type := lower(trim(coalesce(p_room_type, 'audio')));
  IF v_type NOT IN ('audio','video','game') THEN v_type := 'audio'; END IF;

  SELECT setting_value INTO v_limits FROM public.app_settings
   WHERE setting_key = 'party_room_limits' LIMIT 1;

  IF v_type = 'audio' THEN
    v_total := coalesce((v_limits ->> 'max_audio_participants')::int, 10);
  ELSIF v_type = 'game' THEN
    v_total := coalesce((v_limits ->> 'max_game_participants')::int, 8);
  ELSE
    v_total := coalesce((v_limits ->> 'max_video_participants')::int, 4);
  END IF;
  v_total := greatest(2, least(v_total, 20));
  v_max := v_total;

  v_pass := nullif(trim(coalesce(p_password, '')), '');
  IF v_pass IS NOT NULL AND length(v_pass) > 64 THEN
    RAISE EXCEPTION 'Password too long';
  END IF;
  v_locked := v_pass IS NOT NULL;
  v_hash := CASE WHEN v_pass IS NOT NULL
                 THEN extensions.crypt(v_pass, extensions.gen_salt('bf', 10))
                 ELSE NULL END;

  -- Auto-close previous active room for this host
  UPDATE public.party_room_participants p
     SET left_at = coalesce(p.left_at, now())
   WHERE p.left_at IS NULL
     AND p.room_id IN (
       SELECT pr.id FROM public.party_rooms pr
        WHERE pr.host_id = v_uid AND coalesce(pr.is_active, true) = true
     );
  UPDATE public.party_rooms pr
     SET is_active = false, ended_at = coalesce(pr.ended_at, now())
   WHERE pr.host_id = v_uid AND coalesce(pr.is_active, true) = true;

  INSERT INTO public.party_rooms (
    host_id, name, room_type, game_mode,
    password_hash, is_locked, total_seats, max_participants, is_active
  )
  VALUES (
    v_uid, v_trim_name, v_type,
    nullif(trim(coalesce(p_game_mode, '')), ''),
    v_hash, v_locked, v_total, v_max, true
  )
  RETURNING id INTO new_id;

  -- The room host must exist as an active participant immediately, before the
  -- frontend starts LiveKit token creation or viewers can enter from Discover.
  INSERT INTO public.party_room_participants(room_id, user_id, role, seat_number, is_muted, joined_at, left_at)
  VALUES (new_id, v_uid, 'host', 0, false, now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET left_at = NULL,
        role = 'host',
        seat_number = 0,
        is_muted = false;

  RETURN new_id;
END;
$function$;