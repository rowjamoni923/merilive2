-- Pkg72: Live page male visibility
CREATE OR REPLACE FUNCTION public.get_public_home_hosts_v1(
  p_selected_country text DEFAULT 'all',
  p_sub_tab text DEFAULT 'popular',
  p_current_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, display_name text, username text, avatar_url text, bio text,
  country_code text, country_flag text, user_level integer, host_level integer,
  is_online boolean, is_in_call boolean, is_host boolean, gender text,
  call_rate_per_minute integer, is_verified boolean, is_face_verified boolean,
  created_at timestamptz, frame_id uuid, last_seen_at timestamptz,
  host_status text, host_availability text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH followed AS (
    SELECT f.following_id FROM public.followers f
    WHERE p_sub_tab = 'following' AND p_current_user_id IS NOT NULL
      AND f.follower_id = p_current_user_id
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
    AND (p_selected_country = 'all' OR p.country_code = p_selected_country)
    AND (
      (
        COALESCE(p.is_host, false) = true
        AND lower(COALESCE(p.gender, '')) = 'female'
        AND p.host_status = 'approved'
        AND (
          (p_sub_tab = 'live' AND p.id IN (SELECT host_id FROM live_host_ids))
          OR (
            p_sub_tab <> 'live'
            AND COALESCE(p.is_online, false) = true
            AND COALESCE(p.host_availability, 'online') <> 'offline'
            AND COALESCE(p.last_seen_at, '-infinity'::timestamptz) >= now() - interval '60 minutes'
            AND (p_sub_tab <> 'following' OR p.id IN (SELECT following_id FROM followed))
            AND (p_sub_tab <> 'new' OR p.created_at >= now() - interval '7 days')
          )
        )
      )
      OR
      (
        lower(COALESCE(p.gender, '')) = 'male'
        AND (
          (p_sub_tab = 'live' AND p.id IN (SELECT host_id FROM live_host_ids))
          OR (
            p_sub_tab = 'following' AND p_current_user_id IS NOT NULL
            AND p.id IN (SELECT following_id FROM followed)
          )
        )
      )
    )
  ORDER BY
    CASE WHEN p.id IN (SELECT host_id FROM live_host_ids) THEN 0 ELSE 1 END,
    p.last_seen_at DESC NULLS LAST
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_home_hosts_v1(text, text, uuid) TO anon, authenticated;