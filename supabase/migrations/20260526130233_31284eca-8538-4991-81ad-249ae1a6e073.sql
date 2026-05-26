CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE status = 'ringing'
    AND created_at < now() - interval '60 seconds';

  UPDATE public.private_calls
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected'
    AND started_at < now() - interval '2 hours';

  UPDATE public.profiles
  SET is_in_call = false, current_call_id = NULL
  WHERE is_in_call = true
    AND id NOT IN (
      SELECT caller_id FROM public.private_calls WHERE status IN ('ringing', 'connected')
      UNION
      SELECT host_id   FROM public.private_calls WHERE status IN ('ringing', 'connected')
    );

  UPDATE public.profiles
  SET is_online = false
  WHERE is_online = true
    AND COALESCE(last_seen_at, '-infinity'::timestamptz) < now() - interval '30 minutes';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_home_hosts_v1(
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
  host_availability text
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
      AND COALESCE(p.is_face_verified, false) = true
      AND (v_country = 'all' OR p.country_code = v_country)
  )
  SELECT
    e.id, e.display_name, e.username, e.avatar_url, e.bio,
    e.country_code, e.country_flag, e.user_level, e.host_level,
    e.is_really_online,
    CASE WHEN e.verified_female_host AND e.is_really_online
         THEN (COALESCE(e.is_in_call, false) OR e.has_active_call)
         ELSE false END,
    COALESCE(e.is_host, false),
    e.gender,
    CASE WHEN e.verified_female_host
              AND e.is_really_online
              AND NOT (COALESCE(e.is_in_call, false) OR e.has_active_call)
         THEN e.call_rate_per_minute ELSE NULL END,
    COALESCE(e.is_verified, false),
    COALESCE(e.is_face_verified, false),
    e.created_at, e.frame_id, e.last_seen_at, e.host_status,
    COALESCE(e.host_availability, 'online')
  FROM eligible e
  WHERE
    (
      e.verified_female_host
      AND (
        (v_tab = 'live' AND e.is_live_now)
        OR (
          v_tab <> 'live'
          AND (v_tab <> 'following' OR e.id IN (SELECT following_id FROM followed))
          AND (v_tab <> 'new'       OR e.created_at >= now() - interval '7 days')
        )
      )
    )
    OR
    (
      v_tab IN ('live','following')
      AND lower(COALESCE(e.gender, '')) = 'male'
      AND (
        (v_tab = 'live' AND e.is_live_now)
        OR (v_tab = 'following' AND e.id IN (SELECT following_id FROM followed))
      )
    )
  ORDER BY
    CASE WHEN e.is_live_now THEN 0 ELSE 1 END,
    CASE WHEN e.is_really_online THEN 0 ELSE 1 END,
    e.last_seen_at DESC NULLS LAST,
    e.created_at DESC
  LIMIT 120;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_online_users() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_online_users() TO authenticated, service_role;