-- =====================================================================
-- DEAD-FOREVER PARITY for party rooms.
-- Live streams and private calls already auto-clean stale active rows
-- of the same host when a NEW session starts. Party rooms used to raise
-- `party_host_already_has_active_room`, which broke "close + restart"
-- when a previous row hadn't fully torn down (network drop, force-quit,
-- backgrounded WebView, etc.). This migration brings party rooms to
-- parity: close = instant finish, recreate = brand-new fresh row.
-- =====================================================================

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

  -- ✨ DEAD-FOREVER: auto-close any previous active party room for this host.
  -- Matches the behavior of start_live_stream / start_private_call so the host
  -- can close + immediately re-open with a brand-new row, no manual cleanup.
  UPDATE public.party_room_participants p
     SET left_at = coalesce(p.left_at, now())
   WHERE p.left_at IS NULL
     AND p.room_id IN (
       SELECT pr.id FROM public.party_rooms pr
        WHERE pr.host_id = v_uid AND coalesce(pr.is_active, true) = true
     );

  UPDATE public.party_rooms pr
     SET is_active = false,
         ended_at = coalesce(pr.ended_at, now())
   WHERE pr.host_id = v_uid
     AND coalesce(pr.is_active, true) = true;

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
$function$;

-- =====================================================================
-- Maintenance helper for abandoned party rooms (host force-quit / OS killed
-- the app without firing end_party_room). 15-minute grace window mirrors
-- the conservative threshold used for live_streams (10 min there because
-- streams have a 60-second heartbeat; party_rooms heartbeat less reliably,
-- so we give them a slightly longer window).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_party_rooms()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer := 0;
BEGIN
  -- Close participants belonging to stale rooms first.
  UPDATE public.party_room_participants p
     SET left_at = now()
    FROM public.party_rooms pr
   WHERE p.room_id = pr.id
     AND p.left_at IS NULL
     AND coalesce(pr.is_active, false) = true
     AND coalesce(pr.last_activity_at, pr.created_at) < now() - interval '15 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.party_room_participants p2
        WHERE p2.room_id = pr.id
          AND p2.left_at IS NULL
          AND coalesce(p2.last_seen_at, p2.joined_at) > now() - interval '5 minutes'
     );

  UPDATE public.party_rooms pr
     SET is_active = false,
         ended_at = coalesce(pr.ended_at, now())
   WHERE coalesce(pr.is_active, false) = true
     AND coalesce(pr.last_activity_at, pr.created_at) < now() - interval '15 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.party_room_participants p2
        WHERE p2.room_id = pr.id
          AND p2.left_at IS NULL
          AND coalesce(p2.last_seen_at, p2.joined_at) > now() - interval '5 minutes'
     );

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$function$;