
-- Trigger function: keep profile in sync with face verification submission status
CREATE OR REPLACE FUNCTION public.sync_profile_on_face_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _face_url text;
  _approve_as text;
  _profile_gender text;
BEGIN
  -- Only act when status actually transitions
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  _face_url := COALESCE(NEW.face_image_url, NEW.selfie_url);
  _approve_as := COALESCE(NEW.verification_type, 'user');

  -- Allow this trigger to bypass profile-protection guards
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF NEW.status = 'approved' THEN
    SELECT gender INTO _profile_gender FROM profiles WHERE id = NEW.user_id;

    IF _approve_as = 'host' OR _profile_gender = 'female' THEN
      UPDATE profiles
      SET is_verified = TRUE,
          is_face_verified = TRUE,
          face_verification_image = COALESCE(_face_url, face_verification_image),
          face_verified_at = COALESCE(face_verified_at, now()),
          is_host = TRUE,
          host_status = 'approved'
      WHERE id = NEW.user_id;
    ELSE
      UPDATE profiles
      SET is_verified = TRUE,
          is_face_verified = TRUE,
          face_verification_image = COALESCE(_face_url, face_verification_image),
          face_verified_at = COALESCE(face_verified_at, now())
      WHERE id = NEW.user_id;
    END IF;

  ELSIF NEW.status = 'rejected' THEN
    UPDATE profiles
    SET is_face_verified = FALSE,
        face_verification_image = NULL,
        face_verified_at = NULL
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_on_face_verification ON public.face_verification_submissions;
CREATE TRIGGER trg_sync_profile_on_face_verification
AFTER INSERT OR UPDATE OF status ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_on_face_verification();

-- Backfill: any approved submissions whose profile is out of sync
DO $$
DECLARE
  r RECORD;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  FOR r IN
    SELECT s.user_id,
           COALESCE(s.face_image_url, s.selfie_url) AS face_url,
           COALESCE(s.verification_type, 'user') AS approve_as,
           p.gender
    FROM face_verification_submissions s
    JOIN profiles p ON p.id = s.user_id
    WHERE s.status = 'approved'
      AND (p.is_face_verified IS NOT TRUE
           OR (p.gender = 'female' AND p.is_host IS NOT TRUE))
  LOOP
    IF r.approve_as = 'host' OR r.gender = 'female' THEN
      UPDATE profiles
      SET is_verified = TRUE,
          is_face_verified = TRUE,
          face_verification_image = COALESCE(r.face_url, face_verification_image),
          face_verified_at = COALESCE(face_verified_at, now()),
          is_host = TRUE,
          host_status = 'approved'
      WHERE id = r.user_id;
    ELSE
      UPDATE profiles
      SET is_verified = TRUE,
          is_face_verified = TRUE,
          face_verification_image = COALESCE(r.face_url, face_verification_image),
          face_verified_at = COALESCE(face_verified_at, now())
      WHERE id = r.user_id;
    END IF;
  END LOOP;
END $$;
