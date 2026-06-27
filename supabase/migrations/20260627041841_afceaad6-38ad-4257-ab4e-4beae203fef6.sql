-- Admin Face Verification: upload-incomplete rows are retry-required, never rejected.
-- Even if an old row still has status='rejected', the admin list/count RPCs must
-- bucket it as Pending/Needs Retry when evidence never reached storage.

CREATE OR REPLACE FUNCTION public.face_verification_has_renderable_media(_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(NULLIF(trim(coalesce(_url, '')), ''), '') <> ''
     AND trim(coalesce(_url, '')) NOT LIKE 'admin-approved://%'
     AND trim(coalesce(_url, '')) NOT LIKE 'pending://%';
$$;

CREATE OR REPLACE FUNCTION public.face_verification_is_retry_required(
  _status text,
  _admin_notes text,
  _ai_analysis jsonb,
  _profile_photo_url text,
  _video_url text,
  _face_image_url text,
  _front_url text,
  _selfie_url text,
  _host_photos text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN true
    WHEN lower(coalesce(_ai_analysis->>'requires_resubmit', '')) IN ('true','1','yes') THEN true
    WHEN lower(coalesce(_ai_analysis->>'orphan_media', '')) IN ('true','1','yes') THEN true
    WHEN jsonb_typeof(coalesce(_ai_analysis, '{}'::jsonb)->'retry_required') IN ('object','array','string') THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload incomplete%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload-incomplete%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload was incomplete%' THEN true
    WHEN public.face_verification_status_bucket(_status) <> 'approved'
      AND lower(coalesce(_ai_analysis->>'upload_pending', '')) NOT IN ('true','1','yes')
      AND NOT (
        public.face_verification_has_renderable_media(_profile_photo_url)
        OR public.face_verification_has_renderable_media(_video_url)
        OR public.face_verification_has_renderable_media(_face_image_url)
        OR public.face_verification_has_renderable_media(_front_url)
        OR public.face_verification_has_renderable_media(_selfie_url)
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(_host_photos, ARRAY[]::text[])) AS hp(url)
          WHERE public.face_verification_has_renderable_media(hp.url)
        )
      ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_profile_on_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    IF public.face_verification_status_bucket(NEW.status) = 'approved' THEN
      UPDATE public.profiles
      SET is_face_verified = true,
          face_verification_status = 'verified',
          face_verified_at = coalesce(face_verified_at, now()),
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF lower(trim(coalesce(NEW.status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete')
       OR public.face_verification_is_retry_required(
            NEW.status, NEW.admin_notes, NEW.ai_analysis,
            NEW.profile_photo_url, NEW.video_url, NEW.face_image_url, NEW.front_url, NEW.selfie_url, NEW.host_photos
          ) THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'needs_retry',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
    ELSIF public.face_verification_status_bucket(NEW.status) = 'rejected' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'rejected',
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF public.face_verification_status_bucket(NEW.status) = 'pending' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'under_review',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_face_submission_from_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_face_verified, false) IS TRUE
     OR lower(trim(coalesce(NEW.face_verification_status, ''))) IN ('approved','verified') THEN
    UPDATE public.face_verification_submissions s
       SET status = 'approved',
           verification_type = CASE
             WHEN COALESCE(NEW.is_host, false) IS TRUE OR lower(trim(coalesce(NEW.gender, ''))) = 'female' THEN 'host'
             ELSE 'user'
           END,
           reviewed_at = COALESCE(s.reviewed_at, now()),
           rejection_reason = NULL,
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending'
       AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
       AND (
         COALESCE(s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url) IS NOT NULL
         OR COALESCE(array_length(s.host_photos, 1), 0) > 0
       );
  ELSIF lower(trim(coalesce(NEW.face_verification_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN
    UPDATE public.face_verification_submissions s
       SET status = 'needs_retry',
           reviewed_at = NULL,
           rejection_reason = NULL,
           admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''), '[profile-sync] Marked retry-required; not rejected.'),
           ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb) || jsonb_build_object('requires_resubmit', true, 'upload_pending', false),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending';
  ELSIF lower(trim(coalesce(NEW.face_verification_status, ''))) = 'rejected' THEN
    UPDATE public.face_verification_submissions s
       SET status = 'rejected',
           reviewed_at = COALESCE(s.reviewed_at, now()),
           rejection_reason = COALESCE(s.rejection_reason, NULLIF(s.admin_notes, ''), 'Verification rejected.'),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending'
       AND public.face_verification_is_retry_required(
             s.status, s.admin_notes, s.ai_analysis,
             s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos
           ) = false;
  END IF;

  RETURN NEW;
END;
$$;

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
      CASE WHEN retry_required THEN 'pending' ELSE public.face_verification_status_bucket(status) END AS status_bucket,
      CASE WHEN retry_required THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS is_auto_reviewed,
      CASE WHEN retry_required THEN 'needs_retry' ELSE lower(trim(coalesce(status, ''))) END AS raw_status,
      resolved_role
    FROM (
      SELECT
        s.*,
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
    'needs_retry', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'needs_retry'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
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
    'pending', 0, 'submitted', 0, 'under_review', 0, 'needs_retry', 0,
    'approved', 0, 'rejected', 0,
    'auto_approved', 0, 'auto_rejected', 0,
    'auto_host', 0, 'auto_user', 0, 'auto_face_verification', 0,
    'manual_pending', 0, 'manual_approved', 0, 'manual_rejected', 0,
    'manual_total', 0, 'total', 0
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.admin_face_verification_stats(NULL::text);
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
      CASE WHEN retry_required THEN 'pending' ELSE public.face_verification_status_bucket(status) END AS effective_status_bucket,
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
       OR (v_st IN ('pending','manual_pending','needs_retry','retry_required','upload_failed','upload_incomplete') AND effective_status_bucket = 'pending')
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
      CASE WHEN retry_required THEN 'pending' ELSE public.face_verification_status_bucket(status) END AS effective_status_bucket,
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
       OR (v_st IN ('pending','manual_pending','needs_retry','retry_required','upload_failed','upload_incomplete') AND effective_status_bucket = 'pending')
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

CREATE OR REPLACE FUNCTION public.repair_face_incomplete_upload_rejections_v2()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  PERFORM set_config('app.bypass_terminal_status_guard', 'true', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.face_verification_submissions s
     SET status = 'needs_retry',
         reviewed_at = NULL,
         rejection_reason = NULL,
         admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''), '[system-fix 20260627063000] Upload incomplete; retry required, not rejected.'),
         ai_analysis = jsonb_strip_nulls(
           (coalesce(s.ai_analysis, '{}'::jsonb) - 'auto_rejected_reason')
           || jsonb_build_object(
                'upload_pending', false,
                'orphan_media', true,
                'requires_resubmit', true,
                'status_corrected_from_rejected', true,
                'retry_required', jsonb_build_object(
                  'kind', 'upload_incomplete',
                  'headline', 'Upload incomplete',
                  'summary', 'Photo/video/live scan did not finish uploading. User must submit again.'
                )
              )
         ),
         updated_at = now()
   WHERE public.face_verification_is_retry_required(
           s.status, s.admin_notes, s.ai_analysis,
           s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos
         )
     AND public.face_verification_status_bucket(s.status) = 'rejected'
     AND coalesce(s.is_duplicate_face, false) = false
     AND s.duplicate_face_user_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.profiles p
     SET is_face_verified = false,
         face_verification_status = 'needs_retry',
         face_verification_image = NULL,
         face_verified_at = NULL,
         updated_at = now()
    FROM public.face_verification_submissions s
   WHERE s.user_id = p.id
     AND lower(trim(coalesce(s.status, ''))) = 'needs_retry'
     AND public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos)
     AND NOT EXISTS (
       SELECT 1 FROM public.face_verification_submissions ok
       WHERE ok.user_id = p.id
         AND public.face_verification_status_bucket(ok.status) = 'approved'
     );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.face_verification_has_renderable_media(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.face_verification_is_retry_required(text,text,jsonb,text,text,text,text,text,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_face_incomplete_upload_rejections_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.face_verification_has_renderable_media(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_retry_required(text,text,jsonb,text,text,text,text,text,text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tg_sync_profile_on_face_verification_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_face_submission_from_profile_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_face_incomplete_upload_rejections_v2() TO service_role;

SELECT public.repair_face_incomplete_upload_rejections_v2();