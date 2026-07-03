-- 2026-07-03: Retry rows must NOT appear in admin manual queue.
-- Rows waiting on the USER (needs_retry / retry_required / upload_failed /
-- upload_incomplete) are user-side actions, not admin work. Bucket them as
-- 'user_retry' so the admin Pending tab only shows genuine manual review.

CREATE OR REPLACE FUNCTION public.face_verification_status_bucket(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('approved','auto_approved','auto-approved','auto_verified','auto-verified','verified','passed') THEN 'approved'
    WHEN lower(trim(coalesce(_status, ''))) IN ('rejected','auto_rejected','auto-rejected','failed','denied') THEN 'rejected'
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN 'user_retry'
    WHEN lower(trim(coalesce(_status, ''))) IN ('pending','submitted','under_review','applied','in_review','reviewing') THEN 'pending'
    ELSE 'pending'
  END;
$function$;

-- Admin host-application stats: exclude user_retry from pending count so the
-- Pending badge only shows genuine admin-review items.
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
    'total', count(*) FILTER (WHERE status_bucket <> 'user_retry')
  ) INTO r FROM host_apps;

  RETURN coalesce(r, jsonb_build_object('pending',0,'under_review',0,'user_retry',0,'approved',0,'rejected',0,'total',0));
END;
$function$;

-- Also drop admin-tunable face threshold rows from app_settings so the values
-- can only be set in edge-function code from now on.
DELETE FROM public.app_settings
WHERE setting_key IN (
  'face_verification_same_person_min_similarity',
  'face_verification_super_strong_min',
  'face_verification_strong_identity_min'
);