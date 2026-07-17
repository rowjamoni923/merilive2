-- Permanent parity guard: profile verification must follow the canonical submission bucket.
-- This fixes future mismatches where statuses like auto_approved/verified/passed are approved
-- in the queue but did not flip profiles.is_face_verified because the old trigger checked
-- only NEW.status = 'approved'.

CREATE OR REPLACE FUNCTION public.tg_sync_profile_on_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket text;
  v_role text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    v_bucket := public.face_verification_status_bucket(NEW.status);
    v_role := CASE
      WHEN lower(trim(coalesce(NEW.verification_type, ''))) = 'host' THEN 'host'
      ELSE 'user'
    END;

    IF v_bucket = 'approved' THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles
      SET is_verified = true,
          is_face_verified = true,
          face_verification_status = 'approved',
          face_verified_at = coalesce(face_verified_at, NEW.reviewed_at, now()),
          face_verification_image = coalesce(NEW.face_image_url, NEW.front_url, NEW.selfie_url, NEW.profile_photo_url, face_verification_image),
          avatar_url = coalesce(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url, avatar_url),
          is_host = CASE WHEN v_role = 'host' THEN true ELSE is_host END,
          host_status = CASE WHEN v_role = 'host' THEN 'approved' ELSE host_status END,
          gender = CASE WHEN v_role = 'host' THEN 'female' ELSE coalesce(nullif(gender, ''), 'male') END,
          updated_at = now()
      WHERE id = NEW.user_id;
      PERFORM set_config('app.bypass_profile_protection', 'false', true);

    ELSIF v_bucket = 'rejected' THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'rejected',
          face_verified_at = NULL,
          updated_at = now()
      WHERE id = NEW.user_id;
      PERFORM set_config('app.bypass_profile_protection', 'false', true);

    ELSIF v_bucket = 'user_retry' THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'needs_retry',
          face_verified_at = NULL,
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
      PERFORM set_config('app.bypass_profile_protection', 'false', true);

    ELSE
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'pending',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
      PERFORM set_config('app.bypass_profile_protection', 'false', true);
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RAISE;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_on_face_verification_status ON public.face_verification_submissions;
CREATE TRIGGER trg_sync_profile_on_face_verification_status
AFTER INSERT OR UPDATE OF status
ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_profile_on_face_verification_status();

REVOKE ALL ON FUNCTION public.tg_sync_profile_on_face_verification_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_sync_profile_on_face_verification_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.face_verification_is_retry_required(text,text,jsonb,text,text,text,text,text,text[]) TO service_role;

-- One-time safe reconciliation: only latest approved submissions with a real approved bucket
-- can mark the profile as face-verified. No submission rows are fabricated.
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(coalesce(s.created_at, '-infinity'::timestamptz), coalesce(s.updated_at, '-infinity'::timestamptz), coalesce(s.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST,
      s.id DESC
  )
  UPDATE public.profiles p
     SET is_verified = true,
         is_face_verified = true,
         face_verification_status = 'approved',
         face_verified_at = coalesce(p.face_verified_at, latest.reviewed_at, now()),
         face_verification_image = coalesce(latest.face_image_url, latest.front_url, latest.selfie_url, latest.profile_photo_url, p.face_verification_image),
         avatar_url = coalesce(latest.profile_photo_url, latest.front_url, latest.selfie_url, p.avatar_url),
         updated_at = now()
    FROM latest
   WHERE p.id = latest.user_id
     AND public.face_verification_status_bucket(latest.status) = 'approved'
     AND coalesce(p.is_face_verified, false) = false;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RAISE;
END $$;