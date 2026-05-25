-- Pkg336 pass-2: ensure busy hosts are also excluded from callable home feed eligibility.
-- start_private_call already blocks both 'offline' and 'busy'; this aligns listing logic with callability.

CREATE OR REPLACE FUNCTION public.get_public_home_hosts_v1(
  p_selected_country text DEFAULT 'all'::text,
  p_sub_tab text DEFAULT 'popular'::text,
  p_current_user_id uuid DEFAULT NULL::uuid  -- IGNORED; kept for client compat
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
    WHERE v_tab = 'following'
      AND f.follower_id = v_uid
  ), live_host_ids AS (
    SELECT DISTINCT ls.host_id
    FROM public.live_streams ls
    WHERE ls.is_active = true
      AND ls.host_id IS NOT NULL
  ), active_call_hosts AS (
    SELECT DISTINCT pc.host_id
    FROM public.private_calls pc
    WHERE pc.status IN ('pending', 'ringing', 'connected')
      AND pc.ended_at IS NULL
      AND pc.host_id IS NOT NULL
  ), eligible AS (
    SELECT
      p.*,
      (p.id IN (SELECT host_id FROM live_host_ids)) AS is_live_now,
      (p.id IN (SELECT host_id FROM active_call_hosts)) AS has_active_call,
      (
        COALESCE(p.is_host, false) = true
        AND lower(COALESCE(p.gender, '')) = 'female'
        AND p.host_status = 'approved'
        AND COALESCE(p.is_face_verified, false) = true
        AND COALESCE(p.is_online, false) = true
        AND lower(COALESCE(p.host_availability, 'online')) = 'online'
      ) AS callable_host
    FROM public.profiles p
    WHERE COALESCE(p.is_blocked, false) = false
      AND COALESCE(p.is_banned, false) = false
      AND COALESCE(p.is_deleted, false) = false
      AND COALESCE(p.is_face_verified, false) = true
      AND (v_country = 'all' OR p.country_code = v_country)
  )
  SELECT e.id, e.display_name, e.username, e.avatar_url, e.bio,
    e.country_code, e.country_flag, e.user_level, e.host_level,
    COALESCE(e.is_online, false),
    CASE WHEN e.callable_host THEN (COALESCE(e.is_in_call, false) OR e.has_active_call) ELSE false END,
    COALESCE(e.is_host, false), e.gender,
    CASE WHEN e.callable_host AND NOT (COALESCE(e.is_in_call, false) OR e.has_active_call) THEN e.call_rate_per_minute ELSE NULL END,
    COALESCE(e.is_verified, false), COALESCE(e.is_face_verified, false),
    e.created_at, e.frame_id, e.last_seen_at, e.host_status,
    COALESCE(e.host_availability, 'online')
  FROM eligible e
  WHERE
    (
      e.callable_host
      AND (
        (v_tab = 'live' AND e.is_live_now)
        OR (
          v_tab <> 'live'
          AND COALESCE(e.last_seen_at, '-infinity'::timestamptz) >= now() - interval '60 minutes'
          AND (v_tab <> 'following' OR e.id IN (SELECT following_id FROM followed))
          AND (v_tab <> 'new' OR e.created_at >= now() - interval '7 days')
        )
      )
    )
    OR
    (
      v_tab IN ('live', 'following')
      AND lower(COALESCE(e.gender, '')) = 'male'
      AND (
        (v_tab = 'live' AND e.is_live_now)
        OR (v_tab = 'following' AND e.id IN (SELECT following_id FROM followed))
      )
    )
  ORDER BY
    CASE WHEN e.is_live_now THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(e.is_online,false) THEN 0 ELSE 1 END,
    e.last_seen_at DESC NULLS LAST,
    e.created_at DESC
  LIMIT 120;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) TO authenticated;