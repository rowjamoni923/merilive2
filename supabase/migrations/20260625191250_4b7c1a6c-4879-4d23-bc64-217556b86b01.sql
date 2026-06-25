CREATE OR REPLACE FUNCTION public.tg_sync_profile_on_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      UPDATE public.profiles
      SET is_face_verified = true,
          face_verification_status = 'verified',
          face_verified_at = coalesce(face_verified_at, now()),
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF NEW.status = 'rejected' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'rejected',
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF public.face_verification_status_bucket(NEW.status) = 'pending' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'pending',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
    END IF;
  END IF;

  RETURN NEW;
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