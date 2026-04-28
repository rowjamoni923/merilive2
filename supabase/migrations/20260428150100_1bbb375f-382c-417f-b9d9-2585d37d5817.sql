-- Pkg5 completion: server-side pagination + consolidated stats for User Management

-- 1) Face verification submission counts in a single round-trip
CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'pending',      COUNT(*) FILTER (WHERE status = 'pending'),
    'under_review', COUNT(*) FILTER (WHERE status = 'under_review'),
    'approved',     COUNT(*) FILTER (WHERE status = 'approved'),
    'rejected',     COUNT(*) FILTER (WHERE status = 'rejected'),
    'total',        COUNT(*)
  )
  INTO result
  FROM public.face_verification_submissions;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_face_verification_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated;

-- 2) Paginated host listing — bypasses 500-row REST cap, supports filter+search
CREATE OR REPLACE FUNCTION public.admin_list_hosts_paginated(
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit  int  DEFAULT 50,
  _offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_data jsonb;
  total_count bigint;
  v_search text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_search := NULLIF(TRIM(COALESCE(_search, '')), '');

  SELECT COUNT(*)
  INTO total_count
  FROM public.profiles p
  WHERE p.is_host = true
    AND (_status IS NULL OR _status = 'all' OR p.host_status = _status)
    AND (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
      OR p.app_uid     ILIKE '%' || v_search || '%'
    );

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO rows_data
  FROM (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.is_verified,
      p.is_blocked,
      p.host_level,
      p.host_status,
      p.call_rate_per_minute,
      p.total_earnings,
      p.total_call_minutes,
      p.total_calls_received,
      p.agency_id,
      p.created_at,
      p.app_uid,
      jsonb_build_object('name', a.name, 'agency_code', a.agency_code) AS agencies
    FROM public.profiles p
    LEFT JOIN public.agencies a ON a.id = p.agency_id
    WHERE p.is_host = true
      AND (_status IS NULL OR _status = 'all' OR p.host_status = _status)
      AND (
        v_search IS NULL
        OR p.display_name ILIKE '%' || v_search || '%'
        OR p.app_uid     ILIKE '%' || v_search || '%'
      )
    ORDER BY p.total_earnings DESC NULLS LAST
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object(
    'rows',  rows_data,
    'total', total_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_hosts_paginated(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_hosts_paginated(text, text, int, int) TO anon, authenticated;