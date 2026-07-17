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
        WHEN coalesce(x.is_face_verified, false) THEN false
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
    'auto_approved', 0, 'auto_rejected', 0,
    'auto_host', 0, 'auto_user', 0, 'auto_face_verification', 0,
    'manual_pending', 0, 'manual_approved', 0, 'manual_rejected', 0,
    'manual_total', 0, 'total', 0
  ));
END;
$function$;