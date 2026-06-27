-- Face verification retry integrity: incomplete upload is retry-required, not rejection.

-- 1) Make retry-style statuses explicit pending/review bucket values.
CREATE OR REPLACE FUNCTION public.face_verification_status_bucket(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('approved','auto_approved','auto-approved','auto_verified','auto-verified','verified','passed') THEN 'approved'
    WHEN lower(trim(coalesce(_status, ''))) IN ('rejected','auto_rejected','auto-rejected','failed','denied') THEN 'rejected'
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete','pending','submitted','under_review','applied','in_review','reviewing') THEN 'pending'
    ELSE 'pending'
  END;
$$;

-- 2) System upload-retry rows must never inflate Auto Rejected counts.
CREATE OR REPLACE FUNCTION public.face_verification_is_auto_reviewed(_status text, _admin_notes text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload was incomplete%' THEN false
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN false
    WHEN lower(trim(coalesce(_status, ''))) IN ('auto_approved','auto-approved','auto_verified','auto-verified','auto_rejected','auto-rejected') THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%[auto]%' THEN true
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
$$;

CREATE OR REPLACE FUNCTION public.face_verification_is_auto_reviewed(_status text, _admin_notes text, _verification_method text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload was incomplete%' THEN false
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN false
    ELSE public.face_verification_is_auto_reviewed(_status, _admin_notes)
      OR lower(trim(coalesce(_verification_method, ''))) LIKE 'auto%'
      OR lower(trim(coalesce(_verification_method, ''))) IN ('aws','rekognition','aws_rekognition','auto_face','auto_face_verification')
  END;
$$;

GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text,text) TO anon, authenticated, service_role;

-- 3) Repair existing wrongly rejected upload-failure rows. These are not fraud/admin rejects.
SELECT set_config('app.bypass_terminal_status_guard', 'true', true);
SELECT set_config('app.bypass_profile_protection', 'true', true);

WITH repaired AS (
  UPDATE public.face_verification_submissions s
     SET status = 'needs_retry',
         reviewed_at = NULL,
         rejection_reason = NULL,
         admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''),
           '[system-fix 20260627061500] Upload-incomplete row restored to retry-required; not a rejection.'),
         ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb)
           || jsonb_build_object(
                'upload_pending', false,
                'orphan_media', true,
                'requires_resubmit', true,
                'retry_required', jsonb_build_object(
                  'kind', 'upload_incomplete',
                  'headline', 'Upload incomplete',
                  'summary', 'Your photo, video, or live scan did not finish uploading. Please submit the verification again.',
                  'steps', jsonb_build_array('Profile photo', 'Verification video', 'Live face scan')
                ),
                'auto_rejected_reason', null,
                'status_corrected_from_rejected', true
              ),
         updated_at = now()
   WHERE lower(trim(coalesce(s.status, ''))) = 'rejected'
     AND COALESCE(s.ai_analysis->>'auto_rejected_reason', '') = 'orphan_media_missing'
   RETURNING s.user_id
)
UPDATE public.profiles p
   SET is_face_verified = false,
       face_verification_status = 'needs_retry',
       face_verification_image = NULL,
       face_verified_at = NULL,
       updated_at = now()
  FROM repaired r
 WHERE p.id = r.user_id
   AND NOT EXISTS (
     SELECT 1
     FROM public.face_verification_submissions ok
     WHERE ok.user_id = p.id
       AND public.face_verification_status_bucket(ok.status) = 'approved'
   );

-- 4) Keep future blank upload rows as retry-required if an admin/repair job touches them,
--    not as terminal rejection. This is intentionally narrow: duplicate-face stays rejected.
CREATE OR REPLACE FUNCTION public.mark_incomplete_face_uploads_retry_required()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  SELECT set_config('app.bypass_terminal_status_guard', 'true', true) INTO STRICT v_count;
  v_count := 0;

  UPDATE public.face_verification_submissions s
     SET status = 'needs_retry',
         reviewed_at = NULL,
         rejection_reason = NULL,
         admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''),
           '[system-fix] Upload incomplete; user must resubmit. Not rejected.'),
         ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb)
           || jsonb_build_object(
                'upload_pending', false,
                'orphan_media', true,
                'requires_resubmit', true,
                'retry_required', jsonb_build_object(
                  'kind', 'upload_incomplete',
                  'headline', 'Upload incomplete',
                  'summary', 'Your photo, video, or live scan did not finish uploading. Please submit the verification again.',
                  'steps', jsonb_build_array('Profile photo', 'Verification video', 'Live face scan')
                )
              ),
         updated_at = now()
   WHERE public.face_verification_status_bucket(s.status) = 'pending'
     AND s.profile_photo_url IS NULL
     AND s.video_url IS NULL
     AND s.face_image_url IS NULL
     AND s.front_url IS NULL
     AND s.selfie_url IS NULL
     AND COALESCE(array_length(s.host_photos, 1), 0) = 0
     AND s.created_at < now() - interval '10 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_incomplete_face_uploads_retry_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_incomplete_face_uploads_retry_required() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_incomplete_face_uploads_retry_required() TO authenticated;