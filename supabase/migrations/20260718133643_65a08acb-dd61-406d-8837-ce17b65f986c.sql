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
      GREATEST(
        coalesce(s.created_at, '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.reviewed_at, '-infinity'::timestamptz)
      ) DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT
      CASE
        WHEN coalesce(x.is_face_verified, false) THEN 'approved'
        WHEN x.retry_required THEN 'user_retry'
        ELSE public.face_verification_status_bucket(x.status)
      END AS status_bucket,
      CASE
        WHEN x.retry_required THEN false
        ELSE public.face_verification_is_auto_reviewed(x.status, x.admin_notes, x.verification_method)
      END AS is_auto_reviewed,
      CASE
        WHEN coalesce(x.is_face_verified, false) AND public.face_verification_status_bucket(x.status) <> 'approved' THEN 'profile_verified'
        WHEN x.retry_required THEN 'needs_retry'
        ELSE lower(trim(coalesce(x.status, '')))
      END AS raw_status,
      CASE
        WHEN coalesce(x.is_face_verified, false) AND public.face_verification_status_bucket(x.status) <> 'approved' THEN true
        ELSE false
      END AS synthetic_profile_verified,
      x.resolved_role
    FROM (
      SELECT
        s.*,
        p.is_face_verified,
        public.face_verification_is_retry_required(
          s.status, s.admin_notes, s.ai_analysis,
          s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos
        ) AS retry_required,
        CASE
          WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
            OR p.is_host IS TRUE
            OR lower(trim(coalesce(p.gender, ''))) = 'female'
          THEN 'host'
          ELSE 'user'
        END AS resolved_role
      FROM latest s
      LEFT JOIN public.profiles p ON p.id = s.user_id
      WHERE v_q IS NULL
         OR p.display_name ILIKE '%' || v_q || '%'
         OR p.app_uid ILIKE '%' || v_q || '%'
         OR s.full_name ILIKE '%' || v_q || '%'
         OR s.user_id::text ILIKE v_q || '%'
    ) x
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'submitted', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'submitted'),
    'under_review', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'under_review'),
    'needs_retry', count(*) FILTER (WHERE status_bucket = 'user_retry'),
    'user_retry', count(*) FILTER (WHERE status_bucket = 'user_retry'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'profile_face_verified', count(*) FILTER (WHERE status_bucket = 'approved' AND synthetic_profile_verified),
    'profile_verified', count(*) FILTER (WHERE status_bucket = 'approved' AND synthetic_profile_verified),
    'auto_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND is_auto_reviewed),
    'auto_host', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'host'),
    'auto_user', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'user'),
    'auto_face_verification', count(*) FILTER (WHERE is_auto_reviewed),
    'manual_pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'manual_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND NOT is_auto_reviewed),
    'manual_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND NOT is_auto_reviewed),
    'manual_total', count(*) FILTER (WHERE status_bucket = 'pending' OR NOT is_auto_reviewed),
    'total', count(*)
  ) INTO r FROM scoped;

  RETURN coalesce(r, jsonb_build_object(
    'pending', 0, 'submitted', 0, 'under_review', 0, 'needs_retry', 0, 'user_retry', 0,
    'approved', 0, 'rejected', 0, 'profile_face_verified', 0, 'profile_verified', 0,
    'auto_approved', 0, 'auto_rejected', 0, 'auto_host', 0, 'auto_user', 0,
    'auto_face_verification', 0, 'manual_pending', 0, 'manual_approved', 0,
    'manual_rejected', 0, 'manual_total', 0, 'total', 0
  ));
END;
$function$;

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
      CASE
        WHEN coalesce(is_face_verified, false) THEN 'approved'
        WHEN retry_required THEN 'user_retry'
        ELSE public.face_verification_status_bucket(status)
      END AS effective_status_bucket,
      CASE
        WHEN retry_required THEN false
        ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method)
      END AS effective_is_auto_reviewed,
      CASE
        WHEN coalesce(is_face_verified, false) AND public.face_verification_status_bucket(status) <> 'approved' THEN true
        ELSE false
      END AS synthetic_profile_verified
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
       OR (v_st IN ('manual_all','manual-all') AND (effective_status_bucket = 'pending' OR NOT effective_is_auto_reviewed))
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
        WHEN coalesce(is_face_verified, false) THEN 'approved'
        WHEN retry_required THEN 'user_retry'
        ELSE public.face_verification_status_bucket(status)
      END AS effective_status_bucket,
      CASE
        WHEN retry_required THEN false
        ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method)
      END AS effective_is_auto_reviewed,
      CASE
        WHEN coalesce(is_face_verified, false) AND public.face_verification_status_bucket(status) <> 'approved' THEN true
        ELSE false
      END AS synthetic_profile_verified
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
       OR (v_st IN ('manual_all','manual-all') AND (effective_status_bucket = 'pending' OR NOT effective_is_auto_reviewed))
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      f.id, f.user_id, f.resolved_role AS verification_type,
      CASE
        WHEN f.synthetic_profile_verified THEN 'profile_verified'
        WHEN f.retry_required THEN 'needs_retry'
        ELSE f.status
      END AS status,
      f.full_name, f.age, f.language, f.profile_photo_url, f.video_url, f.host_photos,
      f.face_image_url, f.selfie_url, f.front_url, f.left_url, f.right_url,
      f.rejection_reason, f.admin_notes, f.ai_analysis,
      f.effective_status_bucket AS status_bucket,
      f.effective_is_auto_reviewed AS is_auto_reviewed,
      CASE WHEN f.effective_is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source,
      f.synthetic_profile_verified,
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
    ORDER BY
      GREATEST(coalesce(f.created_at, '-infinity'::timestamptz), coalesce(f.updated_at, '-infinity'::timestamptz), coalesce(f.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      f.id DESC
    LIMIT LEAST(GREATEST(coalesce(_limit, 50), 1), 200)
    OFFSET GREATEST(coalesce(_offset, 0), 0)
  ) t;

  RETURN jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb), 'total', coalesce(v_total, 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text, text, integer, integer) TO anon, authenticated, service_role;