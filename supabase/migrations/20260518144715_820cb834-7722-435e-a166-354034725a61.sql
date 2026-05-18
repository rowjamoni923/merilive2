UPDATE public.face_verification_submissions
SET status = 'pending', updated_at = now()
WHERE lower(trim(coalesce(status, ''))) = 'submitted';

CREATE OR REPLACE FUNCTION public.normalize_face_verification_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(trim(coalesce(NEW.status, ''))) = 'submitted' THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_normalize_face_verification_submission_status ON public.face_verification_submissions;
CREATE TRIGGER trg_normalize_face_verification_submission_status
BEFORE INSERT OR UPDATE OF status ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_face_verification_submission_status();