-- Face verification integrity hardening: never approve blank/upload-pending evidence.

-- 0) Allow controlled system repair of impossible terminal statuses while keeping
--    the normal terminal-status guard intact for app/admin traffic.
CREATE OR REPLACE FUNCTION public.tg_guard_terminal_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  IF lower(coalesce(current_setting('app.bypass_terminal_status_guard', true), 'false')) IN ('1','true','t','yes') THEN
    RETURN NEW;
  END IF;

  v_old := lower(coalesce((to_jsonb(OLD)->>'status')::text, ''));
  v_new := lower(coalesce((to_jsonb(NEW)->>'status')::text, ''));

  IF v_old = v_new THEN
    RETURN NEW;
  END IF;

  IF v_old IN ('approved','rejected','completed','paid','cancelled','canceled','failed','refunded') THEN
    RAISE EXCEPTION 'Row % already in terminal state %, cannot transition to %',
      coalesce((to_jsonb(OLD)->>'id'), '?'), v_old, v_new
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;

-- 1) Keep this legacy trigger for duplicate-face fraud only. Gender mismatch is
--    retained in ai_analysis/admin_notes by the Edge Function, but must not
--    auto-reject per owner policy.
CREATE OR REPLACE FUNCTION public.tg_auto_reject_face_gender_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dup_name text;
  v_dup_uid text;
  v_duplicate_face boolean;
BEGIN
  IF public.face_verification_status_bucket(NEW.status) IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  v_duplicate_face := coalesce(NEW.is_duplicate_face, false) OR coalesce(NEW.ai_analysis ? 'duplicate_account', false);
  IF v_duplicate_face THEN
    v_dup_name := coalesce(NEW.duplicate_face_name, NEW.ai_analysis #>> '{duplicate_account,previous_display_name}', 'Existing Account');
    v_dup_uid := coalesce(NEW.duplicate_face_uid, NEW.ai_analysis #>> '{duplicate_account,previous_app_uid}', 'Unknown');
    NEW.status := 'rejected';
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.rejection_reason := format('This face is already registered with another account: %s (ID: %s). One face can only be used for one account. Please contact Support Chat if you believe this is an error.', v_dup_name, v_dup_uid);
    NEW.admin_notes := concat_ws(E'\n', nullif(trim(coalesce(NEW.admin_notes, '')), ''), format('[auto-reject] duplicate_face trigger: existing_account_name=%s existing_account_uid=%s', v_dup_name, v_dup_uid));
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Hard DB guard: an approved submission must contain real persisted evidence
--    and upload_pending must be false. This blocks accidental profile-sync/manual
--    approvals of empty stub rows.
CREATE OR REPLACE FUNCTION public.tg_guard_face_submission_approval_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_media boolean;
  v_upload_pending boolean;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN NEW;
  END IF;

  IF public.face_verification_status_bucket(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  v_has_media := COALESCE(NEW.profile_photo_url, NEW.video_url, NEW.face_image_url, NEW.front_url, NEW.selfie_url) IS NOT NULL
                 OR COALESCE(array_length(NEW.host_photos, 1), 0) > 0;
  v_upload_pending := COALESCE((NEW.ai_analysis->>'upload_pending')::boolean, false);

  IF NOT v_has_media OR v_upload_pending THEN
    RAISE EXCEPTION 'Face verification cannot be approved before photo/video/live evidence upload is complete'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_face_submission_approval_evidence ON public.face_verification_submissions;
CREATE TRIGGER trg_guard_face_submission_approval_evidence
BEFORE INSERT OR UPDATE OF status, profile_photo_url, video_url, face_image_url, front_url, selfie_url, host_photos, ai_analysis
ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_face_submission_approval_evidence();

-- 3) Fix profile -> submission sync: never convert an upload-pending/blank
--    submission to approved just because a profile row was already marked verified.
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
  ELSIF lower(trim(coalesce(NEW.face_verification_status, ''))) = 'rejected'
        OR lower(trim(coalesce(NEW.host_status, ''))) = 'rejected' THEN
    UPDATE public.face_verification_submissions s
       SET status = 'rejected',
           reviewed_at = COALESCE(s.reviewed_at, now()),
           rejection_reason = COALESCE(s.rejection_reason, NULLIF(s.admin_notes, ''), 'Verification rejected.'),
           updated_at = now()
     WHERE s.user_id = NEW.id
       AND public.face_verification_status_bucket(s.status) = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_face_submission_from_profile_status() TO anon, authenticated, service_role;

-- 4) Clean up existing impossible state: approved rows with no persisted media or
--    upload_pending=true are not valid approvals. Move them back to review.
SELECT set_config('app.bypass_terminal_status_guard', 'true', true);
SELECT set_config('app.bypass_profile_protection', 'true', true);

WITH invalid_approved AS (
  UPDATE public.face_verification_submissions s
     SET status = 'under_review',
         reviewed_at = NULL,
         rejection_reason = NULL,
         admin_notes = concat_ws(E'\n', nullif(trim(coalesce(s.admin_notes, '')), ''), '[system-fix] Approval reverted: media upload was incomplete. User must resubmit or admin must review after evidence is present.'),
         ai_analysis = coalesce(s.ai_analysis, '{}'::jsonb) || jsonb_build_object('requires_resubmit', true, 'approval_reverted_media_missing', true, 'upload_pending', false),
         updated_at = now()
   WHERE public.face_verification_status_bucket(s.status) = 'approved'
     AND (
       COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = true
       OR (
         COALESCE(s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url) IS NULL
         AND COALESCE(array_length(s.host_photos, 1), 0) = 0
       )
     )
   RETURNING s.user_id
), users_to_reset AS (
  SELECT DISTINCT ia.user_id
  FROM invalid_approved ia
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.face_verification_submissions ok
    WHERE ok.user_id = ia.user_id
      AND public.face_verification_status_bucket(ok.status) = 'approved'
      AND COALESCE((ok.ai_analysis->>'upload_pending')::boolean, false) = false
      AND (
        COALESCE(ok.profile_photo_url, ok.video_url, ok.face_image_url, ok.front_url, ok.selfie_url) IS NOT NULL
        OR COALESCE(array_length(ok.host_photos, 1), 0) > 0
      )
  )
)
UPDATE public.profiles p
   SET is_face_verified = false,
       face_verification_status = 'under_review',
       face_verification_image = NULL,
       face_verified_at = NULL,
       updated_at = now()
FROM users_to_reset u
WHERE p.id = u.user_id;

-- 5) Re-enqueue only valid pending rows whose uploads are complete and evidence URL exists.
SELECT public._enqueue_face_analyze(id)
FROM public.face_verification_submissions
WHERE COALESCE(status,'') IN ('submitted','pending','under_review')
  AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
  AND COALESCE(rekognition_attempts, 0) < 3
  AND COALESCE(front_url, face_image_url, selfie_url) IS NOT NULL
  AND created_at > now() - interval '24 hours'
  AND (ai_analysis IS NULL OR NOT (ai_analysis ? 'rekognition'));

REVOKE ALL ON FUNCTION public.tg_guard_face_submission_approval_evidence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_guard_face_submission_approval_evidence() TO service_role;
