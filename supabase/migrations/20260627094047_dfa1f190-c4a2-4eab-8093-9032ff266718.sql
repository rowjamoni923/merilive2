CREATE OR REPLACE FUNCTION public.sync_face_submission_from_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_status text;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN NEW;
  END IF;

  v_profile_status := lower(trim(coalesce(NEW.face_verification_status, '')));

  IF COALESCE(NEW.is_face_verified, false) IS TRUE
     OR v_profile_status IN ('approved','verified') THEN
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

  ELSIF v_profile_status IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN
    UPDATE public.face_verification_submissions s
       SET status = 'needs_retry',
           reviewed_at = NULL,
           rejection_reason = NULL,
           admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''), '[profile-sync] Retry-required; upload/media issue is not a rejection.'),
           ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb) || jsonb_build_object('requires_resubmit', true, 'upload_pending', false),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending';

  -- Only mirror REJECTED face_verification_status. host_status is intentionally
  -- ignored so a historical host_status='rejected' doesn't auto-reject a brand-new
  -- in-flight submission. Also gated by a 60s freshness check so we never race
  -- the AI's rich verdict (gender_mismatch / duplicate_face) with a generic string.
  ELSIF v_profile_status = 'rejected' THEN
    UPDATE public.face_verification_submissions s
       SET status = 'rejected',
           reviewed_at = COALESCE(s.reviewed_at, now()),
           rejection_reason = COALESCE(s.rejection_reason, NULLIF(s.admin_notes, ''), 'Verification rejected.'),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending'
       AND lower(trim(coalesce(s.status, ''))) NOT IN ('needs_retry','retry_required','upload_failed','upload_incomplete')
       AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
       AND s.created_at < (now() - interval '60 seconds')
       AND COALESCE(s.updated_at, s.created_at) < (now() - interval '60 seconds');
  END IF;

  RETURN NEW;
END;
$function$;

-- Heal already-poisoned rows in a controlled block with the terminal-status guard
-- temporarily bypassed so we can move generic-rejected rows back to needs_retry.
DO $heal$
BEGIN
  PERFORM set_config('app.bypass_terminal_status_guard', 'true', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.face_verification_submissions
     SET status = 'needs_retry',
         rejection_reason = NULL,
         reviewed_at = NULL,
         admin_notes = concat_ws(E'\n',
           NULLIF(trim(coalesce(admin_notes, '')), ''),
           '[heal] reset from generic profile-sync rejection so AI can re-evaluate.'),
         ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || jsonb_build_object('requires_resubmit', true, 'upload_pending', false),
         updated_at = now()
   WHERE status = 'rejected'
     AND lower(trim(coalesce(rejection_reason, ''))) = 'verification rejected.'
     AND COALESCE(rekognition_attempts, 0) = 0
     AND COALESCE(ai_analysis ? 'face_match', false) = false
     AND COALESCE(ai_analysis ? 'duplicate_account', false) = false;

  UPDATE public.profiles p
     SET face_verification_status = 'needs_retry',
         host_status = CASE WHEN host_status = 'rejected' THEN 'pending_face' ELSE host_status END,
         updated_at = now()
   WHERE face_verification_status = 'rejected'
     AND NOT EXISTS (
       SELECT 1
       FROM public.face_verification_submissions s
       WHERE s.user_id = p.id
         AND s.status = 'rejected'
         AND lower(trim(coalesce(s.rejection_reason, ''))) <> 'verification rejected.'
     );
END
$heal$;