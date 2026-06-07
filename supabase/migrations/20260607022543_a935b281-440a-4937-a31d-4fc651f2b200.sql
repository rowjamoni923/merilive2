CREATE OR REPLACE FUNCTION public.get_public_home_hosts_v2(
  p_selected_country text DEFAULT 'all'::text,
  p_sub_tab text DEFAULT 'popular'::text,
  p_current_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  country_code text,
  country_flag text,
  user_level integer,
  host_level integer,
  is_online boolean,
  is_in_call boolean,
  is_host boolean,
  gender text,
  call_rate_per_minute integer,
  is_verified boolean,
  is_face_verified boolean,
  created_at timestamp with time zone,
  frame_id uuid,
  last_seen_at timestamp with time zone,
  host_status text,
  host_availability text,
  live_stream_id uuid,
  live_viewer_count integer,
  live_thumbnail_url text,
  live_started_at timestamp with time zone,
  active_party_room_id uuid,
  is_in_party boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_country text := upper(COALESCE(NULLIF(trim(p_selected_country), ''), 'all'));
  v_tab text := lower(COALESCE(NULLIF(trim(p_sub_tab), ''), 'popular'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_tab NOT IN ('popular','live','new','following') THEN
    v_tab := 'popular';
  END IF;

  IF v_country = 'ALL' THEN
    v_country := 'all';
  ELSIF v_country !~ '^[A-Z]{2,8}$' THEN
    v_country := 'all';
  END IF;

  RETURN QUERY
  WITH followed AS (
    SELECT f.following_id
    FROM public.followers f
    WHERE v_tab = 'following' AND f.follower_id = v_uid
  ), latest_live AS (
    SELECT DISTINCT ON (ls.host_id)
      ls.host_id,
      ls.id AS stream_id,
      COALESCE(ls.viewer_count, 0) AS viewer_count,
      ls.thumbnail_url,
      COALESCE(ls.started_at, ls.created_at) AS started_at
    FROM public.live_streams ls
    WHERE ls.is_active = true
      AND ls.ended_at IS NULL
      AND ls.host_id IS NOT NULL
    ORDER BY ls.host_id, COALESCE(ls.started_at, ls.created_at) DESC NULLS LAST
  ), active_party AS (
    SELECT DISTINCT ON (pr.host_id)
      pr.host_id,
      pr.id AS room_id
    FROM public.party_rooms pr
    WHERE pr.is_active = true
      AND pr.ended_at IS NULL
      AND pr.host_id IS NOT NULL
    ORDER BY pr.host_id, pr.created_at DESC NULLS LAST
  ), active_call_hosts AS (
    SELECT DISTINCT pc.host_id
    FROM public.private_calls pc
    WHERE pc.status IN ('pending','ringing','connected')
      AND pc.ended_at IS NULL
      AND pc.host_id IS NOT NULL
  ), eligible AS (
    SELECT
      p.*,
      ll.stream_id,
      ll.viewer_count,
      ll.thumbnail_url,
      ll.started_at,
      ap.room_id,
      (ll.stream_id IS NOT NULL) AS is_live_now,
      (ap.room_id IS NOT NULL) AS is_in_party_now,
      (p.id IN (SELECT host_id FROM active_call_hosts)) AS has_active_call,
      (
        COALESCE(p.is_online, false) = true
        AND COALESCE(p.last_seen_at, '-infinity'::timestamptz) >= now() - interval '30 minutes'
        AND lower(COALESCE(p.host_availability, 'online')) <> 'offline'
      ) AS is_really_online,
      (
        COALESCE(p.is_host, false) = true
        AND lower(COALESCE(p.gender, '')) = 'female'
        AND p.host_status = 'approved'
        AND COALESCE(p.is_face_verified, false) = true
        AND lower(COALESCE(p.host_availability, 'online')) <> 'offline'
      ) AS verified_female_host
    FROM public.profiles p
    LEFT JOIN latest_live ll ON ll.host_id = p.id
    LEFT JOIN active_party ap ON ap.host_id = p.id
    WHERE COALESCE(p.is_blocked, false) = false
      AND COALESCE(p.is_banned, false) = false
      AND COALESCE(p.is_deleted, false) = false
      AND (v_country = 'all' OR p.country_code = v_country)
  )
  SELECT
    e.id, e.display_name, e.username, e.avatar_url, e.bio,
    e.country_code, e.country_flag, e.user_level, e.host_level,
    (e.is_really_online OR e.is_live_now OR e.is_in_party_now) AS is_online,
    CASE WHEN e.verified_female_host AND e.is_really_online AND NOT e.is_live_now AND NOT e.is_in_party_now
         THEN (COALESCE(e.is_in_call, false) OR e.has_active_call)
         ELSE false END AS is_in_call,
    COALESCE(e.is_host, false) AS is_host,
    e.gender,
    CASE WHEN e.verified_female_host
              AND e.is_really_online
              AND NOT e.is_live_now
              AND NOT e.is_in_party_now
              AND NOT (COALESCE(e.is_in_call, false) OR e.has_active_call)
         THEN e.call_rate_per_minute ELSE NULL END AS call_rate_per_minute,
    COALESCE(e.is_verified, false) AS is_verified,
    COALESCE(e.is_face_verified, false) AS is_face_verified,
    e.created_at, e.frame_id, e.last_seen_at, e.host_status,
    COALESCE(e.host_availability, 'online') AS host_availability,
    e.stream_id AS live_stream_id,
    COALESCE(e.viewer_count, 0) AS live_viewer_count,
    e.thumbnail_url AS live_thumbnail_url,
    e.started_at AS live_started_at,
    e.room_id AS active_party_room_id,
    e.is_in_party_now AS is_in_party
  FROM eligible e
  WHERE
    CASE v_tab
      WHEN 'live' THEN e.is_live_now
      WHEN 'popular' THEN
        e.verified_female_host
        AND (e.is_live_now OR e.is_in_party_now OR e.is_really_online OR e.has_active_call)
      WHEN 'new' THEN
        e.verified_female_host
        AND e.created_at >= now() - interval '7 days'
        AND (e.is_live_now OR e.is_in_party_now OR e.is_really_online OR e.has_active_call)
      WHEN 'following' THEN
        e.id IN (SELECT following_id FROM followed)
        AND (e.is_live_now OR e.is_in_party_now OR e.is_really_online OR e.has_active_call)
      ELSE false
    END
  ORDER BY
    CASE WHEN e.is_live_now THEN 0 ELSE 1 END,
    CASE WHEN e.is_in_party_now THEN 0 ELSE 1 END,
    CASE WHEN e.has_active_call THEN 0 ELSE 1 END,
    CASE WHEN e.is_really_online THEN 0 ELSE 1 END,
    e.started_at DESC NULLS LAST,
    e.last_seen_at DESC NULLS LAST,
    e.created_at DESC
  LIMIT 300;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_home_hosts_v2(text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_home_hosts_v2(text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_profile_presence_v1(p_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  is_live boolean,
  live_stream_id uuid,
  live_title text,
  live_viewer_count integer,
  is_party boolean,
  party_room_id uuid,
  party_room_name text,
  is_busy boolean,
  is_online boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH target_profile AS (
    SELECT p.id, p.is_online, p.last_seen_at, p.host_availability, p.is_in_call
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND COALESCE(p.is_blocked, false) = false
      AND COALESCE(p.is_banned, false) = false
      AND COALESCE(p.is_deleted, false) = false
    LIMIT 1
  ), live AS (
    SELECT ls.id, ls.title, COALESCE(ls.viewer_count, 0) AS viewer_count
    FROM public.live_streams ls
    WHERE ls.host_id = p_user_id
      AND ls.is_active = true
      AND ls.ended_at IS NULL
    ORDER BY COALESCE(ls.started_at, ls.created_at) DESC NULLS LAST
    LIMIT 1
  ), party AS (
    SELECT pr.id, pr.name
    FROM public.party_rooms pr
    WHERE pr.host_id = p_user_id
      AND pr.is_active = true
      AND pr.ended_at IS NULL
    ORDER BY pr.created_at DESC NULLS LAST
    LIMIT 1
  ), active_call AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.private_calls pc
      WHERE pc.host_id = p_user_id
        AND pc.status IN ('pending','ringing','connected')
        AND pc.ended_at IS NULL
    ) AS has_call
  )
  SELECT
    tp.id AS user_id,
    (live.id IS NOT NULL) AS is_live,
    live.id AS live_stream_id,
    COALESCE(live.title, '') AS live_title,
    COALESCE(live.viewer_count, 0) AS live_viewer_count,
    (party.id IS NOT NULL) AS is_party,
    party.id AS party_room_id,
    COALESCE(party.name, '') AS party_room_name,
    CASE WHEN live.id IS NULL AND party.id IS NULL THEN (COALESCE(tp.is_in_call, false) OR active_call.has_call) ELSE false END AS is_busy,
    (
      COALESCE(tp.is_online, false) = true
      AND COALESCE(tp.last_seen_at, '-infinity'::timestamptz) >= now() - interval '30 minutes'
      AND lower(COALESCE(tp.host_availability, 'online')) <> 'offline'
    ) OR live.id IS NOT NULL OR party.id IS NOT NULL AS is_online
  FROM target_profile tp
  CROSS JOIN active_call
  LEFT JOIN live ON true
  LEFT JOIN party ON true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_presence_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_presence_v1(uuid) TO service_role;