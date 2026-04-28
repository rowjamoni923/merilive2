-- ============================================================================
-- Package 9: User Management hardening (Online / LiveBans / FaceVerification)
-- ============================================================================

-- 1) Online users paginated list -------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_online_users(
  _search text DEFAULT NULL,
  _limit  int  DEFAULT 50,
  _offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows  jsonb;
  v_q     text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE p.is_online = true
    AND (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.user_level,
      p.is_host,
      p.country_code,
      p.last_seen_at,
      p.app_uid
    FROM public.profiles p
    WHERE p.is_online = true
      AND (
        v_q IS NULL
        OR p.display_name ILIKE '%' || v_q || '%'
        OR p.app_uid ILIKE '%' || v_q || '%'
      )
    ORDER BY p.last_seen_at DESC NULLS LAST
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_online_users(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_online_users(text, int, int) TO authenticated, anon;


-- 2) Live ban full-history stats -----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_live_ban_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active   bigint;
  v_auto     bigint;
  v_unbanned bigint;
  v_total    bigint;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  SELECT
    count(*) FILTER (WHERE is_active = true AND (ban_end IS NULL OR ban_end > now())),
    count(*) FILTER (WHERE auto_banned = true),
    count(*) FILTER (WHERE is_active = false),
    count(*)
  INTO v_active, v_auto, v_unbanned, v_total
  FROM public.live_bans;

  RETURN jsonb_build_object(
    'active',   coalesce(v_active, 0),
    'auto',     coalesce(v_auto, 0),
    'unbanned', coalesce(v_unbanned, 0),
    'total',    coalesce(v_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_live_ban_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_live_ban_stats() TO authenticated, anon;


-- 3) Face verification paginated list with joined profile + agency ------------
CREATE OR REPLACE FUNCTION public.admin_list_face_verification_paginated(
  _status text DEFAULT NULL,   -- pending | under_review | approved | rejected | NULL=all
  _search text DEFAULT NULL,
  _limit  int  DEFAULT 50,
  _offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows  jsonb;
  v_q     text;
  v_st    text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  v_q  := NULLIF(trim(coalesce(_search, '')), '');
  v_st := NULLIF(trim(coalesce(_status, '')), '');

  SELECT count(*) INTO v_total
  FROM public.face_verification_submissions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE (v_st IS NULL OR s.status = v_st)
    AND (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.user_id::text = v_q
    );

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      s.*,
      jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'app_uid', p.app_uid,
        'gender', p.gender,
        'is_host', p.is_host,
        'is_face_verified', p.is_face_verified,
        'is_verified', p.is_verified,
        'country_code', p.country_code,
        'country_flag', p.country_flag,
        'country_name', p.country_name,
        'city', p.city,
        'region', p.region,
        'registration_ip', p.registration_ip,
        'last_login_ip', p.last_login_ip
      ) AS profile,
      ag.name      AS agency_name,
      ag.agency_code AS agency_code
    FROM public.face_verification_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON s.verification_type = 'host'
    WHERE (v_st IS NULL OR s.status = v_st)
      AND (
        v_q IS NULL
        OR p.display_name ILIKE '%' || v_q || '%'
        OR p.app_uid ILIKE '%' || v_q || '%'
        OR s.user_id::text = v_q
      )
    ORDER BY s.created_at DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_face_verification_paginated(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text, text, int, int) TO authenticated, anon;