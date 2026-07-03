-- 2026-07-03: Admin list + stats must exclude user_retry rows from the
-- "Pending" (admin-review) bucket. Retry rows are user-side work.

CREATE OR REPLACE FUNCTION public.admin_list_face_verification_paginated(
  _status text DEFAULT NULL::text,
  _search text DEFAULT NULL::text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT *,
      -- Retry rows now get their own 'user_retry' bucket so they never leak
      -- into the admin Pending queue.
      CASE
        WHEN retry_required THEN 'user_retry'
        ELSE public.face_verification_status_bucket(status)
      END AS effective_status_bucket,
      CASE WHEN retry_required THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS effective_is_auto_reviewed
    FROM (
      SELECT
        s.*,
        p.id AS profile_id,
        p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
        p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
        p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
        ag.name AS agency_name, ag.agency_code AS agency_code,
        public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos) AS retry_required,
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
      WHERE v_q IS NULL
         OR p.display_name ILIKE '%' || v_q || '%'
         OR p.app_uid ILIKE '%' || v_q || '%'
         OR s.full_name ILIKE '%' || v_q || '%'
         OR s.user_id::text ILIKE v_q || '%'
    ) x
  ), filtered AS (
    SELECT * FROM scoped
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending') AND effective_status_bucket = 'pending')
       OR (v_st IN ('user_retry','needs_retry','retry_required','upload_failed','upload_incomplete') AND effective_status_bucket = 'user_retry')
       OR (v_st = 'approved' AND effective_status_bucket = 'approved')
       OR (v_st = 'rejected' AND effective_status_bucket = 'rejected')
       OR (v_st IN ('auto_approved','auto-approved','auto_verified','auto-verified') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_rejected','auto-rejected') AND effective_status_bucket = 'rejected' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_host','auto-host') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'host')
       OR (v_st IN ('auto_user','auto-user') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'user')
       OR (v_st IN ('manual_approved','manual-approved') AND effective_status_bucket = 'approved' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_rejected','manual-rejected') AND effective_status_bucket = 'rejected' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_all','manual-all') AND (effective_status_bucket = 'pending' OR (effective_status_bucket IN ('approved','rejected') AND NOT effective_is_auto_reviewed)))
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT *,
      CASE
        WHEN retry_required THEN 'user_retry'
        ELSE public.face_verification_status_bucket(status)
      END AS effective_status_bucket,
      CASE WHEN retry_required THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS effective_is_auto_reviewed
    FROM (
      SELECT
        s.*,
        p.id AS profile_id,
        p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
        p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
        p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
        ag.name AS agency_name, ag.agency_code AS agency_code,
        public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos) AS retry_required,
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
      WHERE v_q IS NULL
         OR p.display_name ILIKE '%' || v_q || '%'
         OR p.app_uid ILIKE '%' || v_q || '%'
         OR s.full_name ILIKE '%' || v_q || '%'
         OR s.user_id::text ILIKE v_q || '%'
    ) x
  ), filtered AS (
    SELECT * FROM scoped
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending') AND effective_status_bucket = 'pending')
       OR (v_st IN ('user_retry','needs_retry','retry_required','upload_failed','upload_incomplete') AND effective_status_bucket = 'user_retry')
       OR (v_st = 'approved' AND effective_status_bucket = 'approved')
       OR (v_st = 'rejected' AND effective_status_bucket = 'rejected')
       OR (v_st IN ('auto_approved','auto-approved','auto_verified','auto-verified') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_rejected','auto-rejected') AND effective_status_bucket = 'rejected' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_host','auto-host') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'host')
       OR (v_st IN ('auto_user','auto-user') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'user')
       OR (v_st IN ('manual_approved','manual-approved') AND effective_status_bucket = 'approved' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_rejected','manual-rejected') AND effective_status_bucket = 'rejected' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_all','manual-all') AND (effective_status_bucket = 'pending' OR (effective_status_bucket IN ('approved','rejected') AND NOT effective_is_auto_reviewed)))
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      f.id, f.user_id, f.resolved_role AS verification_type,
      CASE WHEN f.retry_required THEN 'needs_retry' ELSE f.status END AS status,
      f.full_name, f.age, f.language, f.profile_photo_url, f.video_url, f.host_photos,
      f.face_image_url, f.selfie_url, f.front_url, f.left_url, f.right_url,
      f.rejection_reason, f.admin_notes, f.ai_analysis,
      f.effective_status_bucket AS status_bucket,
      f.effective_is_auto_reviewed AS is_auto_reviewed,
      CASE WHEN f.effective_is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source,
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
    ORDER BY GREATEST(coalesce(f.created_at, '-infinity'::timestamptz), coalesce(f.updated_at, '-infinity'::timestamptz), coalesce(f.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST, f.id DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', coalesce(v_total, 0));
END;
$function$;

-- Also update admin_face_verification_stats to expose user_retry separately.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_face_verification_stats') THEN
    -- The function exists; recreate a compatible version that emits user_retry.
    NULL;
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT
      CASE
        WHEN public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos)
          THEN 'user_retry'
        ELSE public.face_verification_status_bucket(s.status)
      END AS effective_bucket,
      CASE
        WHEN public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos)
          THEN false
        ELSE public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method)
      END AS is_auto,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
          OR p.is_host IS TRUE
          OR lower(trim(coalesce(p.gender, ''))) = 'female'
        THEN 'host'
        ELSE 'user'
      END AS role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%'
  )
  SELECT jsonb_build_object(
    'pending',        count(*) FILTER (WHERE effective_bucket = 'pending'),
    'under_review',   count(*) FILTER (WHERE effective_bucket = 'pending'),
    'user_retry',     count(*) FILTER (WHERE effective_bucket = 'user_retry'),
    'approved',       count(*) FILTER (WHERE effective_bucket = 'approved'),
    'rejected',       count(*) FILTER (WHERE effective_bucket = 'rejected'),
    'auto_approved',  count(*) FILTER (WHERE effective_bucket = 'approved' AND is_auto),
    'auto_rejected',  count(*) FILTER (WHERE effective_bucket = 'rejected' AND is_auto),
    'auto_host',      count(*) FILTER (WHERE effective_bucket = 'approved' AND is_auto AND role = 'host'),
    'auto_user',      count(*) FILTER (WHERE effective_bucket = 'approved' AND is_auto AND role = 'user'),
    'manual_pending', count(*) FILTER (WHERE effective_bucket = 'pending'),
    'manual_approved',count(*) FILTER (WHERE effective_bucket = 'approved' AND NOT is_auto),
    'manual_rejected',count(*) FILTER (WHERE effective_bucket = 'rejected' AND NOT is_auto),
    'total',          count(*) FILTER (WHERE effective_bucket <> 'user_retry')
  ) INTO r FROM scoped;

  RETURN coalesce(r, jsonb_build_object(
    'pending',0,'under_review',0,'user_retry',0,'approved',0,'rejected',0,
    'auto_approved',0,'auto_rejected',0,'auto_host',0,'auto_user',0,
    'manual_pending',0,'manual_approved',0,'manual_rejected',0,'total',0
  ));
END;
$function$;