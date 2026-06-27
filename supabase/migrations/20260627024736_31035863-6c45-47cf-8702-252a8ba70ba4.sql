-- Face verification integrity hardening: media-first completion, safe profile sync, and instant auto-finalize enablement.

CREATE OR REPLACE FUNCTION public.complete_face_verification_submission_uploads(
  _submission_id uuid,
  _payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.face_verification_submissions%ROWTYPE;
  v_host_photos text[];
BEGIN
  SELECT * INTO v_row
  FROM public.face_verification_submissions
  WHERE id = _submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_row.user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF public.face_verification_status_bucket(v_row.status) <> 'pending' THEN
    RETURN false;
  END IF;

  IF _payload ? 'host_photos' AND jsonb_typeof(_payload->'host_photos') = 'array' THEN
    SELECT array_agg(value) INTO v_host_photos
    FROM jsonb_array_elements_text(_payload->'host_photos') AS t(value);
  END IF;

  UPDATE public.face_verification_submissions
     SET status = COALESCE(NULLIF(_payload->>'status', ''), status, 'under_review'),
         profile_photo_url = CASE WHEN _payload ? 'profile_photo_url' THEN NULLIF(_payload->>'profile_photo_url', '') ELSE profile_photo_url END,
         video_url = CASE WHEN _payload ? 'video_url' THEN NULLIF(_payload->>'video_url', '') ELSE video_url END,
         host_photos = CASE WHEN _payload ? 'host_photos' THEN COALESCE(v_host_photos, ARRAY[]::text[]) ELSE host_photos END,
         face_image_url = CASE WHEN _payload ? 'face_image_url' THEN NULLIF(_payload->>'face_image_url', '') ELSE face_image_url END,
         selfie_url = CASE WHEN _payload ? 'selfie_url' THEN NULLIF(_payload->>'selfie_url', '') ELSE selfie_url END,
         front_url = CASE WHEN _payload ? 'front_url' THEN NULLIF(_payload->>'front_url', '') ELSE front_url END,
         left_url = CASE WHEN _payload ? 'left_url' THEN NULLIF(_payload->>'left_url', '') ELSE left_url END,
         right_url = CASE WHEN _payload ? 'right_url' THEN NULLIF(_payload->>'right_url', '') ELSE right_url END,
         is_duplicate_face = CASE WHEN _payload ? 'is_duplicate_face' THEN COALESCE((_payload->>'is_duplicate_face')::boolean, false) ELSE is_duplicate_face END,
         duplicate_face_user_id = CASE WHEN _payload ? 'duplicate_face_user_id' AND NULLIF(_payload->>'duplicate_face_user_id', '') IS NOT NULL THEN (_payload->>'duplicate_face_user_id')::uuid ELSE duplicate_face_user_id END,
         duplicate_face_name = CASE WHEN _payload ? 'duplicate_face_name' THEN NULLIF(_payload->>'duplicate_face_name', '') ELSE duplicate_face_name END,
         duplicate_face_uid = CASE WHEN _payload ? 'duplicate_face_uid' THEN NULLIF(_payload->>'duplicate_face_uid', '') ELSE duplicate_face_uid END,
         duplicate_face_avatar = CASE WHEN _payload ? 'duplicate_face_avatar' THEN NULLIF(_payload->>'duplicate_face_avatar', '') ELSE duplicate_face_avatar END,
         admin_notes = COALESCE(NULLIF(_payload->>'admin_notes', ''), admin_notes),
         ai_analysis = CASE
           WHEN _payload ? 'ai_analysis' THEN COALESCE(ai_analysis, '{}'::jsonb) || COALESCE(_payload->'ai_analysis', '{}'::jsonb)
           ELSE ai_analysis
         END,
         updated_at = now()
   WHERE id = _submission_id
     AND public.face_verification_status_bucket(status) = 'pending';

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET face_verification_status = 'under_review',
         is_face_verified = false,
         updated_at = now()
   WHERE id = v_row.user_id
     AND COALESCE(is_face_verified, false) = false;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_face_verification_submission_uploads(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_face_verification_submission_uploads(uuid, jsonb) TO authenticated, service_role;

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

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'face_verification_auto_approve_enabled',
  'true'::jsonb,
  'Enable instant AI auto-approval after photo/video/live evidence passes duplicate/liveness/identity gates.'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = 'true'::jsonb,
    description = EXCLUDED.description,
    updated_at = now();

DO $$
BEGIN
  PERFORM set_config('app.bypass_terminal_status_guard', 'true', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.invalid_face_approval_users(user_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.invalid_face_approval_users;

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
  )
  INSERT INTO pg_temp.invalid_face_approval_users(user_id)
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
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles p
     SET is_face_verified = false,
         face_verification_status = 'under_review',
         face_verification_image = NULL,
         face_verified_at = NULL,
         updated_at = now()
  FROM pg_temp.invalid_face_approval_users u
  WHERE p.id = u.user_id;
END;
$$;

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