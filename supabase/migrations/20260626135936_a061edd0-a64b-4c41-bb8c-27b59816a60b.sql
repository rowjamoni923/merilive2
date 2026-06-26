
-- Fix: Auto-analyze never fired for under_review submissions whose URLs
-- arrived via the post-insert RPC. Sweeper only matched submitted/pending
-- with NULL ai_analysis. Now:
--  1) Add AFTER UPDATE trigger that enqueues the moment uploads land.
--  2) Broaden sweeper to cover under_review rows with uploads completed
--     and no rekognition pass yet.

CREATE OR REPLACE FUNCTION public.tg_face_submission_uploads_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_has_url boolean;
  v_old_has_url boolean;
  v_upload_pending boolean;
BEGIN
  IF COALESCE(NEW.status,'') NOT IN ('submitted','pending','under_review') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.rekognition_attempts, 0) > 0 THEN
    RETURN NEW;
  END IF;
  v_upload_pending := COALESCE((NEW.ai_analysis->>'upload_pending')::boolean, false);
  IF v_upload_pending THEN
    RETURN NEW;
  END IF;
  v_new_has_url := COALESCE(NEW.front_url, NEW.face_image_url, NEW.selfie_url) IS NOT NULL;
  v_old_has_url := COALESCE(OLD.front_url, OLD.face_image_url, OLD.selfie_url) IS NOT NULL;
  IF v_new_has_url AND NOT v_old_has_url THEN
    BEGIN
      PERFORM public._enqueue_face_analyze(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_face_submission_uploads_ready ON public.face_verification_submissions;
CREATE TRIGGER trg_face_submission_uploads_ready
AFTER UPDATE OF front_url, face_image_url, selfie_url, ai_analysis, status
ON public.face_verification_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_face_submission_uploads_ready();

-- Broaden sweeper: include under_review, accept rows that have ai_analysis
-- but no rekognition pass yet, and require upload_pending=false.
CREATE OR REPLACE FUNCTION public.sweep_pending_face_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM public.face_verification_submissions
    WHERE COALESCE(status,'') IN ('submitted','pending','under_review')
      AND COALESCE(rekognition_attempts, 0) < 3
      AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
      AND created_at < now() - interval '15 seconds'
      AND created_at > now() - interval '24 hours'
      AND COALESCE(front_url, face_image_url, selfie_url) IS NOT NULL
      AND (
        ai_analysis IS NULL
        OR (NOT (ai_analysis ? 'rekognition') AND NOT (ai_analysis ? 'autoFinalize'))
      )
    ORDER BY created_at ASC
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public._enqueue_face_analyze(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Kick off immediately for the rows currently stuck under_review with uploads
SELECT public._enqueue_face_analyze(id)
FROM public.face_verification_submissions
WHERE COALESCE(status,'') = 'under_review'
  AND COALESCE(rekognition_attempts, 0) = 0
  AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
  AND COALESCE(front_url, face_image_url, selfie_url) IS NOT NULL
  AND created_at > now() - interval '24 hours';
