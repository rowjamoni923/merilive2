
CREATE OR REPLACE FUNCTION public.get_public_home_hosts_v1(
  p_selected_country text DEFAULT 'all'::text,
  p_sub_tab text DEFAULT 'popular'::text,
  p_current_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid, display_name text, username text, avatar_url text, bio text,
  country_code text, country_flag text, user_level integer, host_level integer,
  is_online boolean, is_in_call boolean, is_host boolean, gender text,
  call_rate_per_minute integer, is_verified boolean, is_face_verified boolean,
  created_at timestamp with time zone, frame_id uuid,
  last_seen_at timestamp with time zone, host_status text, host_availability text
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
  ), live_host_ids AS (
    SELECT DISTINCT ls.host_id
    FROM public.live_streams ls
    WHERE ls.is_active = true AND ls.host_id IS NOT NULL
  ), active_call_hosts AS (
    SELECT DISTINCT pc.host_id
    FROM public.private_calls pc
    WHERE pc.status IN ('pending','ringing','connected')
      AND pc.ended_at IS NULL
      AND pc.host_id IS NOT NULL
  ), eligible AS (
    SELECT
      p.*,
      (p.id IN (SELECT host_id FROM live_host_ids)) AS is_live_now,
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
    WHERE COALESCE(p.is_blocked, false) = false
      AND COALESCE(p.is_banned, false) = false
      AND COALESCE(p.is_deleted, false) = false
      AND (v_country = 'all' OR p.country_code = v_country)
  )
  SELECT
    e.id, e.display_name, e.username, e.avatar_url, e.bio,
    e.country_code, e.country_flag, e.user_level, e.host_level,
    -- Live tab: anyone live counts as "online" for badge purposes.
    (e.is_really_online OR e.is_live_now) AS is_online,
    -- Busy badge only relevant for verified female hosts who are really-online
    -- and currently in a private call (not while live).
    CASE WHEN e.verified_female_host AND e.is_really_online AND NOT e.is_live_now
         THEN (COALESCE(e.is_in_call, false) OR e.has_active_call)
         ELSE false END AS is_in_call,
    COALESCE(e.is_host, false) AS is_host,
    e.gender,
    -- Call rate only when callable: verified female host, really online, not busy, not live.
    CASE WHEN e.verified_female_host
              AND e.is_really_online
              AND NOT e.is_live_now
              AND NOT (COALESCE(e.is_in_call, false) OR e.has_active_call)
         THEN e.call_rate_per_minute ELSE NULL END AS call_rate_per_minute,
    COALESCE(e.is_verified, false) AS is_verified,
    COALESCE(e.is_face_verified, false) AS is_face_verified,
    e.created_at, e.frame_id, e.last_seen_at, e.host_status,
    COALESCE(e.host_availability, 'online') AS host_availability
  FROM eligible e
  WHERE
    CASE v_tab
      -- LIVE tab: show EVERY active live stream — users AND hosts, any gender,
      -- regardless of face verification or host_status. This is the public live feed.
      WHEN 'live' THEN e.is_live_now
      -- POPULAR / NEW: verified female hosts only, must be live / online / busy.
      WHEN 'popular' THEN
        e.verified_female_host
        AND (e.is_live_now OR e.is_really_online OR e.has_active_call)
      WHEN 'new' THEN
        e.verified_female_host
        AND e.created_at >= now() - interval '7 days'
        AND (e.is_live_now OR e.is_really_online OR e.has_active_call)
      -- FOLLOWING: any followed profile, live/online/busy. Allow male hosts too.
      WHEN 'following' THEN
        e.id IN (SELECT following_id FROM followed)
        AND (e.is_live_now OR e.is_really_online OR e.has_active_call)
      ELSE false
    END
  ORDER BY
    CASE WHEN e.is_live_now THEN 0 ELSE 1 END,
    CASE WHEN e.has_active_call THEN 0 ELSE 1 END,
    CASE WHEN e.is_really_online THEN 0 ELSE 1 END,
    e.last_seen_at DESC NULLS LAST,
    e.created_at DESC
  LIMIT 200;
END;
$function$;
