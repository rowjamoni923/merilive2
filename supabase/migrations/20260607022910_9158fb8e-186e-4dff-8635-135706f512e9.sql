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
    SELECT DISTINCT ON (pr.id) pr.id, pr.name, pr.created_at
    FROM public.party_rooms pr
    LEFT JOIN public.party_room_participants prp
      ON prp.room_id = pr.id
      AND prp.user_id = p_user_id
      AND prp.left_at IS NULL
    WHERE pr.is_active = true
      AND pr.ended_at IS NULL
      AND (pr.host_id = p_user_id OR prp.user_id = p_user_id)
    ORDER BY pr.id, pr.created_at DESC NULLS LAST
    LIMIT 1
  ), active_call AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.private_calls pc
      WHERE (pc.host_id = p_user_id OR pc.caller_id = p_user_id)
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