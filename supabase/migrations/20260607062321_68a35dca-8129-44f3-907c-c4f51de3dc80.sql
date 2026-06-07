-- Phase G — Fix 2 part B: enable LiveKit update-permission kill switch.
-- setting_value is TEXT holding a JSON string; cast → merge → re-stringify.
UPDATE public.app_settings
SET setting_value = (
  COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object('update_permission', true)
)::text
WHERE setting_key = 'livekit_signaling_enabled';

CREATE OR REPLACE FUNCTION public.can_user_create_party()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_is_host boolean;
  v_is_banned boolean;
  v_is_blocked boolean;
  v_user_level int;
  v_host_level int;
  v_max_user_level int;
  v_current_level int;
  v_required_level int := 0;
  v_party_flag text;
  v_req RECORD;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'auth', 'reason', 'Sign in required.');
  END IF;

  SELECT coalesce(p.is_host, false),
         coalesce(p.is_banned, false),
         coalesce(p.is_blocked, false),
         coalesce(p.user_level, 0),
         coalesce(p.host_level, 0),
         coalesce(p.max_user_level, 0)
  INTO v_is_host, v_is_banned, v_is_blocked, v_user_level, v_host_level, v_max_user_level
  FROM public.profiles p
  WHERE p.id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'profile', 'reason', 'Profile not found.');
  END IF;

  IF v_is_banned OR v_is_blocked THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'account_blocked', 'reason', 'Your account cannot create party rooms.');
  END IF;

  SELECT coalesce(lower(trim(setting_value::text)), 'true') INTO v_party_flag
  FROM public.app_settings WHERE setting_key = 'party_rooms_enabled' LIMIT 1;
  IF v_party_flag IS NULL THEN v_party_flag := 'true'; END IF;
  IF v_party_flag IN ('false','0','off','no') THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'disabled', 'reason', 'Party rooms are temporarily disabled.');
  END IF;

  SELECT * INTO v_req FROM public.feature_level_requirements
   WHERE feature_key = 'create_party' AND coalesce(is_active, true) = true LIMIT 1;

  IF FOUND THEN
    IF v_is_host THEN
      v_required_level := coalesce(v_req.min_level_host, v_req.min_vip_level, v_req.min_level, 0);
      v_current_level := GREATEST(v_host_level, v_user_level, v_max_user_level);
    ELSE
      v_required_level := coalesce(v_req.min_level_user, v_req.min_level, 0);
      v_current_level := GREATEST(v_user_level, v_max_user_level);
    END IF;

    IF v_current_level < v_required_level THEN
      RETURN jsonb_build_object(
        'allowed', false, 'code', 'level',
        'reason', format('You need to reach level %s to create a party room. Your current level is %s.', v_required_level, v_current_level),
        'required_level', v_required_level,
        'current_level', v_current_level,
        'is_host', v_is_host
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'reason', '', 'is_host', v_is_host);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_create_party() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_party_room(
  p_name text,
  p_room_type text,
  p_game_mode text DEFAULT NULL::text,
  p_password text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gate jsonb;
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

  SELECT public.can_user_create_party() INTO v_gate;
  IF coalesce((v_gate->>'allowed')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', coalesce(v_gate->>'reason', 'Not allowed to create party room.')
      USING ERRCODE = 'P0001';
  END IF;

  v_trim_name := trim(coalesce(p_name, ''));
  IF v_trim_name = '' THEN v_trim_name := 'Party Room'; END IF;
  IF length(v_trim_name) > 80 THEN v_trim_name := left(v_trim_name, 80); END IF;

  v_type := lower(trim(coalesce(p_room_type, 'audio')));
  IF v_type NOT IN ('audio','video','game') THEN v_type := 'audio'; END IF;

  SELECT setting_value::jsonb INTO v_limits FROM public.app_settings
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

  INSERT INTO public.party_room_participants(room_id, user_id, role, seat_number, is_muted, joined_at, left_at)
  VALUES (new_id, v_uid, 'host', 0, false, now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET left_at = NULL,
        role = 'host',
        seat_number = 0,
        is_muted = false;

  RETURN new_id;
END;
$$;