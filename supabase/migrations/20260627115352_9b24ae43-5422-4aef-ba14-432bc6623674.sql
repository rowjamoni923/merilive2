CREATE OR REPLACE FUNCTION public.sweep_pending_face_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
  v_healed integer := 0;
BEGIN
  -- Primary path: if media is complete, enqueue the authoritative analyzer.
  FOR r IN
    SELECT id
    FROM public.face_verification_submissions
    WHERE COALESCE(status,'') IN ('submitted','pending','under_review')
      AND COALESCE(rekognition_attempts, 0) < 3
      AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
      AND created_at < now() - interval '15 seconds'
      AND created_at > now() - interval '24 hours'
      AND COALESCE(profile_photo_url, front_url, face_image_url, selfie_url) IS NOT NULL
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

  -- Safety net: rows with missing media/upload_pending=true are impossible to
  -- auto-approve. Convert them to a visible retry after a short grace period so
  -- no new face stays frozen under review.
  BEGIN
    v_healed := public.service_heal_stuck_face_verifications(75);
  EXCEPTION WHEN OTHERS THEN
    v_healed := 0;
  END;

  RETURN v_count + coalesce(v_healed, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_pending_face_verifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_pending_face_verifications() TO service_role;

-- Run once immediately after deploying the stronger sweep.
SELECT public.sweep_pending_face_verifications();