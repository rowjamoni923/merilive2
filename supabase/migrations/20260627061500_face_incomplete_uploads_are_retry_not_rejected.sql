-- Incomplete Face Verification uploads are retry-required/pending, not rejected.
-- This keeps real fraud/admin rejections separate from network/upload failures.

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

CREATE OR REPLACE FUNCTION public.face_verification_is_auto_reviewed(_status text, _admin_notes text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload incomplete%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload-incomplete%' THEN false
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
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload incomplete%' THEN false
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload-incomplete%' THEN false
    ELSE public.face_verification_is_auto_reviewed(_status, _admin_notes)
      OR lower(trim(coalesce(_verification_method, ''))) LIKE 'auto%'
      OR lower(trim(coalesce(_verification_method, ''))) IN ('aws','rekognition','aws_rekognition','auto_face','auto_face_verification')
  END;
$$;

-- Keep profile sync honest for retry states.
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
    ELSIF public.face_verification_status_bucket(NEW.status) = 'rejected' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'rejected',
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF lower(trim(coalesce(NEW.status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'needs_retry',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
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
  ELSIF lower(trim(coalesce(NEW.face_verification_status, ''))) = 'rejected'
        OR lower(trim(coalesce(NEW.host_status, ''))) = 'rejected' THEN
    UPDATE public.face_verification_submissions s
       SET status = 'rejected',
           reviewed_at = COALESCE(s.reviewed_at, now()),
           rejection_reason = COALESCE(s.rejection_reason, NULLIF(s.admin_notes, ''), 'Verification rejected.'),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending'
       AND lower(trim(coalesce(s.status, ''))) NOT IN ('needs_retry','retry_required','upload_failed','upload_incomplete');
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tg_sync_profile_on_face_verification_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_face_submission_from_profile_status() TO anon, authenticated, service_role;

SELECT set_config('app.bypass_terminal_status_guard', 'true', true);
SELECT set_config('app.bypass_profile_protection', 'true', true);

WITH repaired AS (
  UPDATE public.face_verification_submissions s
     SET status = 'needs_retry',
         reviewed_at = NULL,
         rejection_reason = NULL,
         admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''), '[system-fix 20260627061500] Upload incomplete; retry required, not rejected.'),
         ai_analysis = jsonb_strip_nulls(
           COALESCE(s.ai_analysis, '{}'::jsonb)
           || jsonb_build_object(
                'upload_pending', false,
                'orphan_media', true,
                'requires_resubmit', true,
                'status_corrected_from_rejected', true,
                'retry_required', jsonb_build_object(
                  'kind', 'upload_incomplete',
                  'headline', 'Upload incomplete',
                  'summary', 'Photo/video/live scan did not finish uploading. User must submit again.',
                  'steps', jsonb_build_array('Profile photo', 'Verification video', 'Live face scan')
                )
              )
           - 'auto_rejected_reason'
         ),
         updated_at = now()
   WHERE lower(trim(coalesce(s.status, ''))) = 'rejected'
     AND (
       COALESCE(s.ai_analysis->>'auto_rejected_reason', '') = 'orphan_media_missing'
       OR COALESCE((s.ai_analysis->>'orphan_media')::boolean, false) = true
       OR COALESCE((s.ai_analysis->>'requires_resubmit')::boolean, false) = true
       OR lower(coalesce(s.rejection_reason, '')) LIKE '%upload was incomplete%'
       OR lower(coalesce(s.admin_notes, '')) LIKE '%orphan submission%'
       OR lower(coalesce(s.admin_notes, '')) LIKE '%upload-incomplete%'
     )
     AND (
       s.profile_photo_url IS NULL
       AND s.video_url IS NULL
       AND s.face_image_url IS NULL
       AND s.front_url IS NULL
       AND s.selfie_url IS NULL
       AND COALESCE(array_length(s.host_photos, 1), 0) = 0
     )
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
