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
           ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb) - 'retry_required' - 'requires_resubmit' || jsonb_build_object('upload_pending', false),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending'
       AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
       AND (
         COALESCE(s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url) IS NOT NULL
         OR COALESCE(array_length(s.host_photos, 1), 0) > 0
         OR lower(trim(coalesce(s.status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete')
       );
  ELSIF lower(trim(coalesce(NEW.face_verification_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN
    UPDATE public.face_verification_submissions s
       SET status = 'needs_retry',
           reviewed_at = NULL,
           rejection_reason = NULL,
           admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''), '[profile-sync] Retry-required; upload/media issue is not a rejection.'),
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
       AND lower(trim(coalesce(s.status, ''))) NOT IN ('needs_retry','retry_required','upload_failed','upload_incomplete')
       AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_face_submission_from_profile_status() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_face_retry_upload_states()
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

  WITH fixed AS (
    UPDATE public.face_verification_submissions s
       SET status = 'needs_retry',
           reviewed_at = NULL,
           rejection_reason = NULL,
           ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb) || jsonb_build_object(
             'upload_pending', false,
             'requires_resubmit', true,
             'retry_required', jsonb_build_object(
               'kind', 'upload_incomplete',
               'headline', 'Upload incomplete',
               'summary', 'Photo/video/live scan did not finish uploading. User must submit again.',
               'steps', jsonb_build_array('profile_photo','face_video','live_face_scan')
             )
           ),
           admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''), '[system-fix 20260627070000] Missing media repaired to needs_retry, not rejected.'),
           updated_at = now()
     WHERE lower(trim(coalesce(s.status, ''))) = 'rejected'
       AND (
         lower(coalesce(s.rejection_reason, '')) LIKE '%missing front face url%'
         OR lower(coalesce(s.rejection_reason, '')) LIKE '%upload incomplete%'
         OR lower(coalesce(s.admin_notes, '')) LIKE '%missing front face url%'
         OR lower(coalesce(s.admin_notes, '')) LIKE '%upload incomplete%'
         OR COALESCE((s.ai_analysis->>'orphan_media')::boolean, false) = true
         OR COALESCE((s.ai_analysis->>'requires_resubmit')::boolean, false) = true
       )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM fixed;

  UPDATE public.profiles p
     SET is_face_verified = false,
         face_verification_status = 'needs_retry',
         updated_at = now()
   WHERE EXISTS (
     SELECT 1 FROM public.face_verification_submissions s
      WHERE s.user_id = p.id AND lower(trim(coalesce(s.status, ''))) = 'needs_retry'
   )
   AND COALESCE(p.is_face_verified, false) = false;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_face_retry_upload_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_face_retry_upload_states() TO service_role;

SELECT public.repair_face_retry_upload_states();