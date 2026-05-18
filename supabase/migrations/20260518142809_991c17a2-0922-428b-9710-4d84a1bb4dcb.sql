CREATE OR REPLACE FUNCTION public.admin_host_applications_paginated(
  _status text DEFAULT NULL::text,
  _search text DEFAULT NULL::text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total bigint;
  v_rows jsonb;
  v_q text;
  v_st text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');
  v_st := lower(NULLIF(trim(coalesce(_status, '')), ''));
  IF v_st IN ('all', 'total', '*') THEN v_st := NULL; END IF;

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id, coalesce(s.created_at, s.updated_at, s.reviewed_at) DESC NULLS LAST
  ), scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      ag.name AS agency_name, ag.agency_code AS agency_code,
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
          OR p.is_host IS TRUE
          OR lower(trim(coalesce(p.gender, ''))) = 'female'
        THEN 'host'
        ELSE 'user'
      END AS resolved_role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true
    WHERE (v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%')
  ), host_only AS (
    SELECT * FROM scoped WHERE resolved_role = 'host'
  ), filtered AS (
    SELECT * FROM host_only
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending') AND status_bucket = 'pending')
       OR (v_st = 'approved' AND status_bucket = 'approved')
       OR (v_st = 'rejected' AND status_bucket = 'rejected')
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id, coalesce(s.created_at, s.updated_at, s.reviewed_at) DESC NULLS LAST
  ), scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      ag.name AS agency_name, ag.agency_code AS agency_code,
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
          OR p.is_host IS TRUE
          OR lower(trim(coalesce(p.gender, ''))) = 'female'
        THEN 'host'
        ELSE 'user'
      END AS resolved_role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true
    WHERE (v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%')
  ), host_only AS (
    SELECT * FROM scoped WHERE resolved_role = 'host'
  ), filtered AS (
    SELECT * FROM host_only
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending') AND status_bucket = 'pending')
       OR (v_st = 'approved' AND status_bucket = 'approved')
       OR (v_st = 'rejected' AND status_bucket = 'rejected')
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      f.id, f.user_id, f.resolved_role AS verification_type, f.status, f.full_name,
      f.age, f.language, f.profile_photo_url, f.video_url, f.host_photos,
      f.face_image_url, f.selfie_url, f.front_url, f.left_url, f.right_url,
      f.rejection_reason, f.admin_notes, f.status_bucket, f.is_auto_reviewed,
      CASE WHEN f.is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source,
      f.created_at, f.updated_at, f.reviewed_at, f.reviewed_by,
      f.is_duplicate_face, f.duplicate_face_user_id, f.duplicate_face_name,
      f.duplicate_face_uid, f.duplicate_face_avatar, f.verification_method,
      f.confidence_score, f.match_confidence, f.rekognition_confidence,
      f.agency_name, f.agency_code,
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
      ) AS profile
    FROM filtered f
    ORDER BY f.created_at DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', coalesce(v_total, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_host_applications_paginated(text, text, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_host_application_stats(_search text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r jsonb;
  v_q text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id, coalesce(s.created_at, s.updated_at, s.reviewed_at) DESC NULLS LAST
  ), scoped AS (
    SELECT
      public.face_verification_status_bucket(s.status) AS status_bucket,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
          OR p.is_host IS TRUE
          OR lower(trim(coalesce(p.gender, ''))) = 'female'
        THEN 'host'
        ELSE 'user'
      END AS resolved_role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE (v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%')
  ), host_only AS (
    SELECT * FROM scoped WHERE resolved_role = 'host'
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'under_review', 0,
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'total', count(*)
  ) INTO r FROM host_only;

  RETURN coalesce(r, jsonb_build_object('pending',0,'under_review',0,'approved',0,'rejected',0,'total',0));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_host_application_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.admin_host_application_stats(NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.admin_host_application_stats(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_host_application_stats() TO anon, authenticated, service_role;