-- Pkg: Face verification count parity without bypassing evidence integrity.
-- Existing DB guard correctly blocks approved submission rows without media evidence, so
-- profile-only legacy approvals are exposed as read-only synthetic audit rows in admin RPCs.

CREATE OR REPLACE FUNCTION public.face_verification_status_bucket(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('approved','auto_approved','auto-approved','auto_verified','auto-verified','verified','passed') THEN 'approved'
    WHEN lower(trim(coalesce(_status, ''))) IN ('rejected','auto_rejected','auto-rejected','failed','denied') THEN 'rejected'
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete','user_retry') THEN 'user_retry'
    WHEN lower(trim(coalesce(_status, ''))) IN ('pending','submitted','under_review','processing','applied','in_review','reviewing') THEN 'pending'
    ELSE 'pending'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO anon, authenticated, service_role;

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

  WITH latest_submission AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  ), rows_base AS (
    SELECT
      s.id, s.user_id, s.status, s.full_name, s.age, s.language,
      s.profile_photo_url, s.video_url, s.host_photos, s.face_image_url, s.selfie_url,
      s.front_url, s.left_url, s.right_url, s.rejection_reason, s.admin_notes, s.ai_analysis,
      s.created_at, s.updated_at, s.reviewed_at, s.reviewed_by,
      s.is_duplicate_face, s.duplicate_face_user_id, s.duplicate_face_name,
      s.duplicate_face_uid, s.duplicate_face_avatar, s.verification_method,
      s.confidence_score, s.match_confidence, s.rekognition_confidence,
      false AS synthetic_profile_verified,
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
    FROM latest_submission s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true

    UNION ALL

    SELECT
      -- Deterministic synthetic id for read-only admin display only.
      (
        substr(md5(p.id::text || ':profile-face-verified'), 1, 8) || '-' ||
        substr(md5(p.id::text || ':profile-face-verified'), 9, 4) || '-' ||
        substr(md5(p.id::text || ':profile-face-verified'), 13, 4) || '-' ||
        substr(md5(p.id::text || ':profile-face-verified'), 17, 4) || '-' ||
        substr(md5(p.id::text || ':profile-face-verified'), 21, 12)
      )::uuid AS id,
      p.id AS user_id,
      'approved'::text AS status,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(p.username, ''), 'Verified User') AS full_name,
      NULL::integer AS age,
      NULL::text AS language,
      COALESCE(p.avatar_url, p.face_verification_image) AS profile_photo_url,
      NULL::text AS video_url,
      NULL::text[] AS host_photos,
      p.face_verification_image AS face_image_url,
      NULL::text AS selfie_url,
      NULL::text AS front_url,
      NULL::text AS left_url,
      NULL::text AS right_url,
      NULL::text AS rejection_reason,
      '[system] Existing profile face verification; original submission row is not present.'::text AS admin_notes,
      jsonb_build_object('profile_verified_without_submission', true, 'source', 'profiles.is_face_verified') AS ai_analysis,
      COALESCE(p.created_at, p.updated_at, now()) AS created_at,
      COALESCE(p.updated_at, p.face_verified_at, now()) AS updated_at,
      COALESCE(p.face_verified_at, p.updated_at, now()) AS reviewed_at,
      NULL::uuid AS reviewed_by,
      false AS is_duplicate_face,
      NULL::uuid AS duplicate_face_user_id,
      NULL::text AS duplicate_face_name,
      NULL::text AS duplicate_face_uid,
      NULL::text AS duplicate_face_avatar,
      'profile_state'::text AS verification_method,
      NULL::numeric AS confidence_score,
      NULL::numeric AS match_confidence,
      NULL::numeric AS rekognition_confidence,
      true AS synthetic_profile_verified,
      p.id AS profile_id,
      p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      NULL::text AS agency_name,
      NULL::text AS agency_code,
      false AS retry_required,
      CASE WHEN COALESCE(p.is_host, false) OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END AS resolved_role
    FROM public.profiles p
    WHERE COALESCE(p.is_face_verified, false) = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.face_verification_submissions s
        WHERE s.user_id = p.id
          AND public.face_verification_status_bucket(s.status) = 'approved'
      )
  ), scoped AS (
    SELECT *,
      CASE
        WHEN retry_required THEN 'user_retry'
        ELSE public.face_verification_status_bucket(status)
      END AS effective_status_bucket,
      CASE
        WHEN retry_required OR synthetic_profile_verified THEN false
        ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method)
      END AS effective_is_auto_reviewed
    FROM rows_base
    WHERE v_q IS NULL
       OR display_name ILIKE '%' || v_q || '%'
       OR app_uid ILIKE '%' || v_q || '%'
       OR full_name ILIKE '%' || v_q || '%'
       OR user_id::text ILIKE v_q || '%'
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

  WITH latest_submission AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  ), rows_base AS (
    SELECT
      s.id, s.user_id, s.status, s.full_name, s.age, s.language,
      s.profile_photo_url, s.video_url, s.host_photos, s.face_image_url, s.selfie_url,
      s.front_url, s.left_url, s.right_url, s.rejection_reason, s.admin_notes, s.ai_analysis,
      s.created_at, s.updated_at, s.reviewed_at, s.reviewed_by,
      s.is_duplicate_face, s.duplicate_face_user_id, s.duplicate_face_name,
      s.duplicate_face_uid, s.duplicate_face_avatar, s.verification_method,
      s.confidence_score, s.match_confidence, s.rekognition_confidence,
      false AS synthetic_profile_verified,
      p.id AS profile_id,
      p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      ag.name AS agency_name, ag.agency_code AS agency_code,
      public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos) AS retry_required,
      CASE WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END AS resolved_role
    FROM latest_submission s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code FROM public.agency_hosts ah JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST LIMIT 1
    ) ag ON true

    UNION ALL

    SELECT
      (substr(md5(p.id::text || ':profile-face-verified'), 1, 8) || '-' || substr(md5(p.id::text || ':profile-face-verified'), 9, 4) || '-' || substr(md5(p.id::text || ':profile-face-verified'), 13, 4) || '-' || substr(md5(p.id::text || ':profile-face-verified'), 17, 4) || '-' || substr(md5(p.id::text || ':profile-face-verified'), 21, 12))::uuid,
      p.id, 'approved', COALESCE(NULLIF(p.display_name, ''), NULLIF(p.username, ''), 'Verified User'), NULL::integer, NULL::text,
      COALESCE(p.avatar_url, p.face_verification_image), NULL::text, NULL::text[], p.face_verification_image, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text,
      '[system] Existing profile face verification; original submission row is not present.'::text,
      jsonb_build_object('profile_verified_without_submission', true, 'source', 'profiles.is_face_verified'),
      COALESCE(p.created_at, p.updated_at, now()), COALESCE(p.updated_at, p.face_verified_at, now()), COALESCE(p.face_verified_at, p.updated_at, now()), NULL::uuid,
      false, NULL::uuid, NULL::text, NULL::text, NULL::text, 'profile_state', NULL::numeric, NULL::numeric, NULL::numeric, true,
      p.id, p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      NULL::text, NULL::text, false,
      CASE WHEN COALESCE(p.is_host, false) OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END
    FROM public.profiles p
    WHERE COALESCE(p.is_face_verified, false) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.face_verification_submissions s
        WHERE s.user_id = p.id AND public.face_verification_status_bucket(s.status) = 'approved'
      )
  ), scoped AS (
    SELECT *,
      CASE WHEN retry_required THEN 'user_retry' ELSE public.face_verification_status_bucket(status) END AS effective_status_bucket,
      CASE WHEN retry_required OR synthetic_profile_verified THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS effective_is_auto_reviewed
    FROM rows_base
    WHERE v_q IS NULL
       OR display_name ILIKE '%' || v_q || '%'
       OR app_uid ILIKE '%' || v_q || '%'
       OR full_name ILIKE '%' || v_q || '%'
       OR user_id::text ILIKE v_q || '%'
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
    ORDER BY GREATEST(coalesce(f.created_at, '-infinity'::timestamptz), coalesce(f.updated_at, '-infinity'::timestamptz), coalesce(f.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST, f.id DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', coalesce(v_total, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r jsonb;
  v_q text;
  v_profile_face_verified bigint;
  v_profile_verified bigint;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  SELECT count(*) INTO v_profile_face_verified
  FROM public.profiles p
  WHERE COALESCE(p.is_face_verified, false) = true
    AND (v_q IS NULL OR p.display_name ILIKE '%' || v_q || '%' OR p.app_uid ILIKE '%' || v_q || '%' OR p.id::text ILIKE v_q || '%');

  SELECT count(*) INTO v_profile_verified
  FROM public.profiles p
  WHERE COALESCE(p.is_verified, false) = true
    AND (v_q IS NULL OR p.display_name ILIKE '%' || v_q || '%' OR p.app_uid ILIKE '%' || v_q || '%' OR p.id::text ILIKE v_q || '%');

  WITH latest_submission AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  ), rows_base AS (
    SELECT
      s.user_id, s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos, s.verification_method, s.verification_type, s.full_name,
      false AS synthetic_profile_verified,
      p.display_name, p.app_uid, p.gender, p.is_host,
      public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos) AS retry_required
    FROM latest_submission s
    LEFT JOIN public.profiles p ON p.id = s.user_id

    UNION ALL

    SELECT
      p.id, 'approved'::text, '[system] Existing profile face verification; original submission row is not present.'::text,
      jsonb_build_object('profile_verified_without_submission', true, 'source', 'profiles.is_face_verified'),
      COALESCE(p.avatar_url, p.face_verification_image), NULL::text, p.face_verification_image, NULL::text, NULL::text, NULL::text[], 'profile_state'::text,
      CASE WHEN COALESCE(p.is_host, false) OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(p.username, ''), 'Verified User'),
      true,
      p.display_name, p.app_uid, p.gender, p.is_host,
      false
    FROM public.profiles p
    WHERE COALESCE(p.is_face_verified, false) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.face_verification_submissions s
        WHERE s.user_id = p.id AND public.face_verification_status_bucket(s.status) = 'approved'
      )
  ), scoped AS (
    SELECT
      CASE WHEN retry_required THEN 'user_retry' ELSE public.face_verification_status_bucket(status) END AS effective_bucket,
      CASE WHEN retry_required OR synthetic_profile_verified THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS is_auto,
      CASE WHEN lower(trim(coalesce(verification_type, ''))) = 'host' OR is_host IS TRUE OR lower(trim(coalesce(gender, ''))) = 'female' THEN 'host' ELSE 'user' END AS role
    FROM rows_base
    WHERE v_q IS NULL
       OR display_name ILIKE '%' || v_q || '%'
       OR app_uid ILIKE '%' || v_q || '%'
       OR full_name ILIKE '%' || v_q || '%'
       OR user_id::text ILIKE v_q || '%'
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
    'auto_face_verification', count(*) FILTER (WHERE effective_bucket IN ('approved','rejected') AND is_auto),
    'manual_pending', count(*) FILTER (WHERE effective_bucket = 'pending'),
    'manual_approved',count(*) FILTER (WHERE effective_bucket = 'approved' AND NOT is_auto),
    'manual_rejected',count(*) FILTER (WHERE effective_bucket = 'rejected' AND NOT is_auto),
    'manual_total',   count(*) FILTER (WHERE effective_bucket = 'pending' OR (effective_bucket IN ('approved','rejected') AND NOT is_auto)),
    'total',          count(*) FILTER (WHERE effective_bucket <> 'user_retry'),
    'profile_face_verified', v_profile_face_verified,
    'profile_verified', v_profile_verified
  ) INTO r FROM scoped;

  RETURN coalesce(r, jsonb_build_object('pending',0,'under_review',0,'user_retry',0,'approved',0,'rejected',0,'auto_approved',0,'auto_rejected',0,'auto_host',0,'auto_user',0,'auto_face_verification',0,'manual_pending',0,'manual_approved',0,'manual_rejected',0,'manual_total',0,'total',0,'profile_face_verified',COALESCE(v_profile_face_verified,0),'profile_verified',COALESCE(v_profile_verified,0)));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.admin_face_verification_stats(NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total bigint;
  v_hosts bigint;
  v_blocked bigint;
  v_online bigint;
  v_verified bigint;
  v_face_verified bigint;
  v_today bigint;
  v_active_today bigint;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles;
  SELECT count(*) INTO v_hosts FROM public.profiles WHERE is_host = true;
  SELECT count(*) INTO v_blocked FROM public.profiles WHERE is_blocked = true;
  SELECT count(*) INTO v_online FROM public.profiles WHERE is_online = true;
  SELECT count(*) INTO v_verified FROM public.profiles WHERE is_verified = true;
  SELECT count(*) INTO v_face_verified FROM public.profiles WHERE is_face_verified = true;
  SELECT count(*) INTO v_today FROM public.profiles WHERE created_at >= date_trunc('day', now());
  SELECT count(*) INTO v_active_today FROM public.profiles WHERE updated_at >= (now() - interval '24 hours');

  RETURN jsonb_build_object(
    'total', v_total,
    'hosts', v_hosts,
    'blocked', v_blocked,
    'online', v_online,
    'verified', v_verified,
    'face_verified', v_face_verified,
    'today', v_today,
    'active_today', v_active_today
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO anon, authenticated;