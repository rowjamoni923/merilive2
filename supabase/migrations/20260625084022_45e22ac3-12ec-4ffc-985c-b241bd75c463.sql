CREATE OR REPLACE FUNCTION public.tg_face_submission_auto_analyze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Accept under_review now that normalize trigger flips status to 'under_review' instantly.
  IF (COALESCE(NEW.front_url, NEW.face_image_url, NEW.selfie_url) IS NOT NULL)
     AND (COALESCE(NEW.status,'') IN ('submitted','pending','under_review')) THEN
    BEGIN
      PERFORM public._enqueue_face_analyze(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;