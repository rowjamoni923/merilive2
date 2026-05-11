DROP FUNCTION IF EXISTS public.can_access_party_room(uuid, uuid);
DROP FUNCTION IF EXISTS public.create_party_room(text, text, text, text);
DROP FUNCTION IF EXISTS public.end_party_room(uuid);

CREATE OR REPLACE FUNCTION public.can_access_party_room(p_user_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.party_rooms r
    WHERE r.id = p_room_id
      AND COALESCE(r.is_active, true) = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND COALESCE(p.is_blocked, false) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_party_room(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_party_room(
  p_name text,
  p_room_type text,
  p_game_mode text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limits jsonb;
  v_total int;
  v_max int;
  v_trim_name text;
  v_pass text;
  v_locked boolean;
  v_type text;
  new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trim_name := trim(coalesce(p_name, ''));
  IF v_trim_name = '' THEN
    v_trim_name := 'Party Room';
  END IF;

  v_type := lower(trim(coalesce(p_room_type, 'audio')));

  SELECT setting_value
  INTO v_limits
  FROM public.app_settings
  WHERE setting_key = 'party_room_limits'
  LIMIT 1;

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
  v_locked := v_pass IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM public.party_rooms pr
    WHERE pr.host_id = v_uid AND coalesce(pr.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'party_host_already_has_active_room';
  END IF;

  INSERT INTO public.party_rooms (
    host_id,
    name,
    room_type,
    game_mode,
    password,
    is_locked,
    total_seats,
    max_participants,
    is_active
  )
  VALUES (
    v_uid,
    v_trim_name,
    v_type,
    nullif(trim(coalesce(p_game_mode, '')), ''),
    v_pass,
    v_locked,
    v_total,
    v_max,
    true
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_party_room(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_party_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_is_admin := public.is_admin(v_uid);

  UPDATE public.party_rooms pr
  SET is_active = false,
      ended_at = coalesce(pr.ended_at, now())
  WHERE pr.id = p_room_id
    AND (pr.host_id = v_uid OR v_is_admin);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_host_or_room_missing');
  END IF;

  UPDATE public.party_room_participants p
  SET left_at = coalesce(p.left_at, now())
  WHERE p.room_id = p_room_id
    AND p.left_at IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_party_room(uuid) TO authenticated;