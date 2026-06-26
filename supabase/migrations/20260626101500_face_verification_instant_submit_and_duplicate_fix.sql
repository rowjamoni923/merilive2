-- Face verification instant-submit hardening:
-- 1) Owners can complete media uploads after the row is already under_review.
-- 2) Pending bucket writes to profiles as under_review, never generic pending.
-- 3) Profile->submission rejected sync preserves AI/admin rejection reasons.

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

CREATE OR REPLACE FUNCTION public.tg_sync_profile_on_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
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
       AND public.face_verification_status_bucket(s.status) = 'pending';
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
