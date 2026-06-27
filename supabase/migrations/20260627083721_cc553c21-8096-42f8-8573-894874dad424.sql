CREATE OR REPLACE FUNCTION public.tg_sync_profile_on_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_raw_status text;
  v_bucket text;
  v_has_approved boolean;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    v_raw_status := lower(trim(coalesce(NEW.status, '')));
    v_bucket := public.face_verification_status_bucket(NEW.status);

    IF v_bucket = 'approved' THEN
      UPDATE public.profiles
      SET is_face_verified = true,
          face_verification_status = 'approved',
          face_verified_at = coalesce(face_verified_at, now()),
          updated_at = now()
      WHERE id = NEW.user_id;

      UPDATE public.notifications
      SET is_read = true
      WHERE user_id = NEW.user_id
        AND coalesce(is_read, false) = false
        AND type IN ('face_verification_retry','face_verification_needs_retry');

      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.face_verification_submissions s
      WHERE s.user_id = NEW.user_id
        AND s.id IS DISTINCT FROM NEW.id
        AND public.face_verification_status_bucket(s.status) = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = NEW.user_id
        AND (
          coalesce(p.is_face_verified, false) = true
          OR lower(trim(coalesce(p.face_verification_status, ''))) IN ('approved','verified','passed')
          OR p.face_verified_at IS NOT NULL
          OR p.face_verification_image IS NOT NULL
        )
    )
    INTO v_has_approved;

    IF coalesce(v_has_approved, false) THEN
      UPDATE public.notifications
      SET is_read = true
      WHERE user_id = NEW.user_id
        AND coalesce(is_read, false) = false
        AND type IN ('face_verification_retry','face_verification_needs_retry');

      RETURN NEW;
    END IF;

    IF v_raw_status IN ('needs_retry','retry_required','upload_failed','upload_incomplete')
       OR public.face_verification_is_retry_required(
            NEW.status, NEW.admin_notes, NEW.ai_analysis,
            NEW.profile_photo_url, NEW.video_url, NEW.face_image_url, NEW.front_url, NEW.selfie_url, NEW.host_photos
          ) THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'needs_retry',
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF v_bucket = 'rejected' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'rejected',
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF v_bucket = 'pending' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'under_review',
          updated_at = now()
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_from_face_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bucket text;
  v_role text;
  v_gender text;
  v_face_url text;
  v_avatar_src text;
  v_has_approved boolean;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN NEW;
  END IF;

  v_bucket := public.face_verification_status_bucket(NEW.status);
  v_role := CASE WHEN lower(trim(coalesce(NEW.verification_type, ''))) = 'host' THEN 'host' ELSE 'user' END;
  v_gender := CASE WHEN v_role = 'host' THEN 'female' ELSE 'male' END;
  v_face_url := COALESCE(NEW.front_url, NEW.selfie_url, NEW.profile_photo_url, NEW.face_image_url);
  v_avatar_src := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url);

  IF v_bucket = 'approved' THEN
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles
       SET is_verified = true,
           is_face_verified = true,
           face_verification_status = 'approved',
           face_verification_image = COALESCE(v_face_url, face_verification_image),
           face_verified_at = COALESCE(face_verified_at, now()),
           avatar_url = COALESCE(v_avatar_src, avatar_url),
           gender = v_gender,
           is_host = (v_role = 'host'),
           host_status = CASE WHEN v_role = 'host' THEN 'approved' ELSE NULL END,
           updated_at = now()
     WHERE id = NEW.user_id;

    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = NEW.user_id
      AND coalesce(is_read, false) = false
      AND type IN ('face_verification_retry','face_verification_needs_retry');

  ELSIF v_bucket = 'rejected' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.face_verification_submissions s
      WHERE s.user_id = NEW.user_id
        AND s.id IS DISTINCT FROM NEW.id
        AND public.face_verification_status_bucket(s.status) = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = NEW.user_id
        AND (
          coalesce(p.is_face_verified, false) = true
          OR lower(trim(coalesce(p.face_verification_status, ''))) IN ('approved','verified','passed')
          OR p.face_verified_at IS NOT NULL
          OR p.face_verification_image IS NOT NULL
        )
    )
    INTO v_has_approved;

    IF NOT coalesce(v_has_approved, false) THEN
      PERFORM set_config('app.bypass_profile_protection','true',true);
      UPDATE public.profiles
         SET is_face_verified = false,
             face_verification_status = 'rejected',
             face_verification_image = NULL,
             face_verified_at = NULL,
             is_host = false,
             host_status = 'rejected',
             updated_at = now()
       WHERE id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

WITH approved_users AS (
  SELECT DISTINCT user_id
  FROM public.face_verification_submissions
  WHERE public.face_verification_status_bucket(status) = 'approved'
)
UPDATE public.profiles p
SET is_face_verified = true,
    face_verification_status = 'approved',
    face_verified_at = coalesce(p.face_verified_at, now()),
    updated_at = now()
FROM approved_users au
WHERE p.id = au.user_id;

WITH approved_users AS (
  SELECT DISTINCT user_id
  FROM public.face_verification_submissions
  WHERE public.face_verification_status_bucket(status) = 'approved'
)
UPDATE public.notifications n
SET is_read = true
FROM approved_users au
WHERE n.user_id = au.user_id
  AND coalesce(n.is_read, false) = false
  AND n.type IN ('face_verification_retry','face_verification_needs_retry');