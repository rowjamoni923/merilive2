CREATE OR REPLACE FUNCTION public.admin_list_face_verification_paginated(
  _status text DEFAULT NULL,
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
  v_st := lower(NULLIF(trim(coalesce(_status, '')), ''));
  IF v_st IN ('all', 'total', '*') THEN
    v_st := NULL;
  END IF;

  WITH scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name,
      p.avatar_url,
      p.app_uid,
      p.gender,
      p.is_host,
      p.is_face_verified,
      p.is_verified,
      p.country_code,
      p.country_flag,
      p.country_name,
      p.city,
      p.region,
      p.registration_ip,
      p.last_login_ip,
      ag.name AS agency_name,
      ag.agency_code AS agency_code,
      CASE
        WHEN lower(trim(coalesce(s.status, ''))) = 'approved' THEN 'approved'
        WHEN lower(trim(coalesce(s.status, ''))) = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END AS status_bucket,
      CASE
        WHEN lower(trim(coalesce(s.status, ''))) = 'approved'
          AND (
            lower(coalesce(s.admin_notes, '')) LIKE '%[auto]%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto-approved%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto approved%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%service_auto_finalize_face_verification%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%rekognition thresholds passed%'
          ) THEN true
        WHEN lower(trim(coalesce(s.status, ''))) = 'rejected'
          AND (
            lower(coalesce(s.admin_notes, '')) LIKE '%auto-rejected%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto rejected%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto-reject%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto rejected by ai%'
          ) THEN true
        ELSE false
      END AS is_auto_reviewed
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
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  ), filtered AS (
    SELECT *
    FROM scoped
    WHERE v_st IS NULL
       OR (v_st = 'pending' AND status_bucket = 'pending')
       OR (v_st = 'approved' AND status_bucket = 'approved')
       OR (v_st = 'rejected' AND status_bucket = 'rejected')
       OR (v_st = 'auto_approved' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto-approved' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto_verified' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto-verified' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto_rejected' AND status_bucket = 'rejected' AND is_auto_reviewed)
       OR (v_st = 'auto-rejected' AND status_bucket = 'rejected' AND is_auto_reviewed)
       OR (v_st = 'manual_pending' AND status_bucket = 'pending')
       OR (v_st = 'manual-approved' AND status_bucket = 'approved' AND NOT is_auto_reviewed)
       OR (v_st = 'manual_approved' AND status_bucket = 'approved' AND NOT is_auto_reviewed)
       OR (v_st = 'manual-rejected' AND status_bucket = 'rejected' AND NOT is_auto_reviewed)
       OR (v_st = 'manual_rejected' AND status_bucket = 'rejected' AND NOT is_auto_reviewed)
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name,
      p.avatar_url,
      p.app_uid,
      p.gender,
      p.is_host,
      p.is_face_verified,
      p.is_verified,
      p.country_code,
      p.country_flag,
      p.country_name,
      p.city,
      p.region,
      p.registration_ip,
      p.last_login_ip,
      ag.name AS agency_name,
      ag.agency_code AS agency_code,
      CASE
        WHEN lower(trim(coalesce(s.status, ''))) = 'approved' THEN 'approved'
        WHEN lower(trim(coalesce(s.status, ''))) = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END AS status_bucket,
      CASE
        WHEN lower(trim(coalesce(s.status, ''))) = 'approved'
          AND (
            lower(coalesce(s.admin_notes, '')) LIKE '%[auto]%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto-approved%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto approved%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%service_auto_finalize_face_verification%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%rekognition thresholds passed%'
          ) THEN true
        WHEN lower(trim(coalesce(s.status, ''))) = 'rejected'
          AND (
            lower(coalesce(s.admin_notes, '')) LIKE '%auto-rejected%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto rejected%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto-reject%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto rejected by ai%'
          ) THEN true
        ELSE false
      END AS is_auto_reviewed
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
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  ), filtered AS (
    SELECT *
    FROM scoped
    WHERE v_st IS NULL
       OR (v_st = 'pending' AND status_bucket = 'pending')
       OR (v_st = 'approved' AND status_bucket = 'approved')
       OR (v_st = 'rejected' AND status_bucket = 'rejected')
       OR (v_st = 'auto_approved' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto-approved' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto_verified' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto-verified' AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st = 'auto_rejected' AND status_bucket = 'rejected' AND is_auto_reviewed)
       OR (v_st = 'auto-rejected' AND status_bucket = 'rejected' AND is_auto_reviewed)
       OR (v_st = 'manual_pending' AND status_bucket = 'pending')
       OR (v_st = 'manual-approved' AND status_bucket = 'approved' AND NOT is_auto_reviewed)
       OR (v_st = 'manual_approved' AND status_bucket = 'approved' AND NOT is_auto_reviewed)
       OR (v_st = 'manual-rejected' AND status_bucket = 'rejected' AND NOT is_auto_reviewed)
       OR (v_st = 'manual_rejected' AND status_bucket = 'rejected' AND NOT is_auto_reviewed)
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      f.*,
      jsonb_build_object(
        'id', f.profile_id,
        'display_name', f.display_name,
        'avatar_url', f.avatar_url,
        'app_uid', f.app_uid,
        'gender', f.gender,
        'is_host', f.is_host,
        'is_face_verified', f.is_face_verified,
        'is_verified', f.is_verified,
        'country_code', f.country_code,
        'country_flag', f.country_flag,
        'country_name', f.country_name,
        'city', f.city,
        'region', f.region,
        'registration_ip', f.registration_ip,
        'last_login_ip', f.last_login_ip
      ) AS profile,
      CASE WHEN f.is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source
    FROM filtered f
    ORDER BY f.created_at DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', coalesce(v_total, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_face_verification_paginated(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text, text, int, int) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_q text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  WITH scoped AS (
    SELECT
      s.status,
      s.admin_notes,
      CASE
        WHEN lower(trim(coalesce(s.status, ''))) = 'approved' THEN 'approved'
        WHEN lower(trim(coalesce(s.status, ''))) = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END AS status_bucket,
      CASE
        WHEN lower(trim(coalesce(s.status, ''))) = 'approved'
          AND (
            lower(coalesce(s.admin_notes, '')) LIKE '%[auto]%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto-approved%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto approved%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%service_auto_finalize_face_verification%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%rekognition thresholds passed%'
          ) THEN true
        WHEN lower(trim(coalesce(s.status, ''))) = 'rejected'
          AND (
            lower(coalesce(s.admin_notes, '')) LIKE '%auto-rejected%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto rejected%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto-reject%'
            OR lower(coalesce(s.admin_notes, '')) LIKE '%auto rejected by ai%'
          ) THEN true
        ELSE false
      END AS is_auto_reviewed
    FROM public.face_verification_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'submitted', count(*) FILTER (WHERE lower(trim(coalesce(status, ''))) = 'submitted'),
    'under_review', count(*) FILTER (WHERE lower(trim(coalesce(status, ''))) = 'under_review'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'auto_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND is_auto_reviewed),
    'manual_pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'manual_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND NOT is_auto_reviewed),
    'manual_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND NOT is_auto_reviewed),
    'total', count(*)
  ) INTO r
  FROM scoped;

  RETURN coalesce(r, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_face_verification_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_face_verification_stats(NULL::text);
$$;

REVOKE ALL ON FUNCTION public.admin_face_verification_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated;