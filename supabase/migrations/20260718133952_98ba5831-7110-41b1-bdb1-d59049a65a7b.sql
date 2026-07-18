CREATE OR REPLACE FUNCTION public.face_verification_is_auto_reviewed(_status text, _admin_notes text, _verification_method text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload incomplete%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload-incomplete%' THEN false
    WHEN lower(trim(coalesce(_verification_method, ''))) LIKE 'auto%' THEN true
    WHEN lower(trim(coalesce(_verification_method, ''))) IN ('aws','rekognition','aws_rekognition','auto_face','auto_face_verification','auto_rekognition') THEN true
    WHEN lower(trim(coalesce(_status, ''))) IN ('auto_approved','auto-approved','auto_verified','auto-verified','auto_rejected','auto-rejected') THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%[auto]%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%[auto v%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%[auto-reject]%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto-approved%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto approved%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%service_auto_finalize_face_verification%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%rekognition thresholds passed%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto-rejected%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto rejected%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto-reject%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto rejected by ai%' THEN true
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_face_verification_auto_reviewed(
  _status text,
  _verification_method text,
  _ai_analysis jsonb,
  _admin_notes text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.face_verification_is_auto_reviewed(_status, _admin_notes, _verification_method) THEN true
    WHEN public.face_verification_status_bucket(_status) NOT IN ('approved','rejected') THEN false
    WHEN lower(trim(coalesce(_ai_analysis->>'auto_decision', ''))) IN ('approved','rejected','auto_approved','auto_rejected') THEN true
    WHEN lower(trim(coalesce(_ai_analysis #>> '{auto_finalize,method}', ''))) LIKE 'auto%' THEN true
    WHEN lower(trim(coalesce(_ai_analysis #>> '{decision,source}', ''))) LIKE 'auto%' THEN true
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_host_application_stats(_search text DEFAULT NULL::text)
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
      public.face_verification_status_bucket(s.status) AS status_bucket,
      (
        public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method)
        OR (
          public.face_verification_status_bucket(s.status) IN ('approved','rejected')
          AND (
            lower(trim(coalesce(s.ai_analysis->>'auto_decision', ''))) IN ('approved','rejected','auto_approved','auto_rejected')
            OR lower(trim(coalesce(s.ai_analysis #>> '{auto_finalize,method}', ''))) LIKE 'auto%'
            OR lower(trim(coalesce(s.ai_analysis #>> '{decision,source}', ''))) LIKE 'auto%'
          )
        )
      ) AS is_auto_reviewed,
      (
        lower(trim(coalesce(s.verification_type, ''))) = 'host'
        OR p.is_host IS TRUE
        OR lower(trim(coalesce(p.gender, ''))) = 'female'
        OR coalesce(array_length(s.host_photos, 1), 0) > 0
        OR nullif(trim(coalesce(s.video_url, '')), '') IS NOT NULL
        OR coalesce(s.ai_analysis->'evidence_required', '[]'::jsonb) ? 'host_gallery_photos'
      ) AS is_host_application
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE (v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%')
  ), host_apps AS (
    SELECT * FROM scoped WHERE is_host_application
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'under_review', count(*) FILTER (WHERE status_bucket = 'pending'),
    'user_retry', count(*) FILTER (WHERE status_bucket = 'user_retry'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'auto_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND is_auto_reviewed),
    'auto_host', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_user', 0,
    'auto_face_verification', count(*) FILTER (WHERE status_bucket IN ('approved','rejected') AND is_auto_reviewed),
    'manual_pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'manual_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND NOT is_auto_reviewed),
    'manual_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND NOT is_auto_reviewed),
    'manual_total', count(*) FILTER (WHERE status_bucket = 'pending' OR (status_bucket IN ('approved','rejected') AND NOT is_auto_reviewed)),
    'total', count(*) FILTER (WHERE status_bucket <> 'user_retry')
  ) INTO r FROM host_apps;

  RETURN coalesce(r, jsonb_build_object('pending',0,'under_review',0,'user_retry',0,'approved',0,'rejected',0,'auto_approved',0,'auto_rejected',0,'auto_host',0,'auto_user',0,'auto_face_verification',0,'manual_pending',0,'manual_approved',0,'manual_rejected',0,'manual_total',0,'total',0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_face_verification_auto_reviewed(text,text,jsonb,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_host_application_stats(text) TO anon, authenticated, service_role;