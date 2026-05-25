-- Pkg330 home page audit pass-1
-- (1) get_public_home_hosts_v1: trusted client-supplied p_current_user_id
--     for the 'following' branch let any caller (incl. anon) enumerate ANY
--     user's followed-host online/in-call/last-seen graph. Combined with the
--     male-following branch that returns male profile rows, this leaked
--     bio/last_seen_at/is_online/is_in_call/host_status of any user's
--     followed people. Fix: ignore the client value, derive from auth.uid(),
--     and require an authenticated caller. Also REVOKE anon.
-- (2) get_public_host_countries_v1: REVOKE anon to keep host-country
--     enumeration behind login (home is auth-gated anyway).

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
  v_country text := COALESCE(NULLIF(p_selected_country, ''), 'all');
  v_tab text := COALESCE(NULLIF(p_sub_tab, ''), 'popular');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_tab NOT IN ('popular','live','new','following') THEN
    v_tab := 'popular';
  END IF;
  IF length(v_country) > 8 THEN
    v_country := 'all';
  END IF;

  RETURN QUERY
  WITH followed AS (
    SELECT f.following_id FROM public.followers f
    WHERE v_tab = 'following' AND f.follower_id = v_uid
  ), live_host_ids AS (
    SELECT DISTINCT ls.host_id FROM public.live_streams ls
    WHERE ls.is_active = true AND ls.host_id IS NOT NULL
  )
  SELECT p.id, p.display_name, p.username, p.avatar_url, p.bio,
    p.country_code, p.country_flag, p.user_level, p.host_level,
    COALESCE(p.is_online, false), COALESCE(p.is_in_call, false),
    COALESCE(p.is_host, false), p.gender, p.call_rate_per_minute,
    COALESCE(p.is_verified, false), COALESCE(p.is_face_verified, false),
    p.created_at, p.frame_id, p.last_seen_at, p.host_status,
    COALESCE(p.host_availability, 'online')
  FROM public.profiles p
  WHERE COALESCE(p.is_blocked, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_deleted, false) = false
    AND COALESCE(p.is_face_verified, false) = true
    AND (v_country = 'all' OR p.country_code = v_country)
    AND (
      (
        COALESCE(p.is_host, false) = true
        AND lower(COALESCE(p.gender, '')) = 'female'
        AND p.host_status = 'approved'
        AND (
          (v_tab = 'live' AND p.id IN (SELECT host_id FROM live_host_ids))
          OR (
            v_tab <> 'live'
            AND COALESCE(p.is_online, false) = true
            AND COALESCE(p.host_availability, 'online') <> 'offline'
            AND COALESCE(p.last_seen_at, '-infinity'::timestamptz) >= now() - interval '60 minutes'
            AND (v_tab <> 'following' OR p.id IN (SELECT following_id FROM followed))
            AND (v_tab <> 'new' OR p.created_at >= now() - interval '7 days')
          )
        )
      )
      OR
      (
        lower(COALESCE(p.gender, '')) = 'male'
        AND (
          (v_tab = 'live' AND p.id IN (SELECT host_id FROM live_host_ids))
          OR (
            v_tab = 'following'
            AND p.id IN (SELECT following_id FROM followed)
          )
        )
      )
    )
  ORDER BY
    CASE WHEN p.id IN (SELECT host_id FROM live_host_ids) THEN 0 ELSE 1 END,
    p.last_seen_at DESC NULLS LAST
  LIMIT 100;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_public_host_countries_v1() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_host_countries_v1() TO authenticated;