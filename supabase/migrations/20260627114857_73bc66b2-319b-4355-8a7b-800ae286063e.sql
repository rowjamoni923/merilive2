CREATE OR REPLACE FUNCTION public._enqueue_face_analyze(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_secret text;
  v_url    text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/face-verification-analyze';
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';
BEGIN
  IF _submission_id IS NULL THEN
    RETURN;
  END IF;

  SELECT setting_value INTO v_secret
  FROM public.app_settings
  WHERE setting_key = 'face_cron_secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        v_anon,
      'Authorization', 'Bearer ' || v_anon,
      'x-cron-secret', v_secret
    ),
    body    := jsonb_build_object('submissionId', _submission_id),
    timeout_milliseconds := 30000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._enqueue_face_analyze(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._enqueue_face_analyze(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.service_heal_stuck_face_verifications(_max_age_seconds integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec record;
  requeued int := 0;
  retried int := 0;
BEGIN
  -- Media-complete rows should go back through the authoritative analyzer so
  -- duplicate-face, gender mismatch, approval, and precise retry verdicts are preserved.
  FOR rec IN
    SELECT id
      FROM public.face_verification_submissions
     WHERE status IN ('submitted','pending','under_review')
       AND updated_at < now() - make_interval(secs => _max_age_seconds)
       AND COALESCE(profile_photo_url, face_image_url, front_url, selfie_url) IS NOT NULL
       AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
       AND (
         ai_analysis IS NULL
         OR NOT (ai_analysis ? 'rekognition')
         OR COALESCE(admin_notes,'') NOT LIKE '%[heal-reanalyze]%'
       )
     ORDER BY created_at ASC
     LIMIT 50
  LOOP
    BEGIN
      PERFORM public._enqueue_face_analyze(rec.id);
      UPDATE public.face_verification_submissions
         SET admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(admin_notes,'')),''), '[heal-reanalyze] re-invoked face-verification-analyze'),
             updated_at = now()
       WHERE id = rec.id;
      requeued := requeued + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Blank/upload-pending rows cannot be analyzed or approved. Convert them to a
  -- user-visible retry immediately so they never stay frozen under review.
  WITH stuck_blank AS (
    SELECT id, user_id
      FROM public.face_verification_submissions
     WHERE status IN ('submitted','pending','under_review')
       AND updated_at < now() - make_interval(secs => _max_age_seconds)
       AND COALESCE(profile_photo_url, video_url, face_image_url, front_url, selfie_url) IS NULL
       AND COALESCE(array_length(host_photos, 1), 0) = 0
  ), upd AS (
    UPDATE public.face_verification_submissions s
       SET status = 'needs_retry',
           rejection_reason = NULL,
           reviewed_at = NULL,
           ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb) || jsonb_build_object(
             'upload_pending', false,
             'requires_resubmit', true,
             'retry_required', jsonb_build_object(
               'kind', 'upload_incomplete',
               'verification_type', COALESCE(NULLIF(lower(trim(s.verification_type)), ''), 'user'),
               'failed_evidence', jsonb_build_array(jsonb_build_object(
                 'label', 'upload',
                 'human_name', 'Verification Media',
                 'step', 'photo',
                 'score', NULL,
                 'message', 'Your photo, video, or live face scan did not finish uploading. Please retry verification in good light.'
               )),
               'steps', jsonb_build_array('photo', 'live_face_scan'),
               'headline', 'Verification upload incomplete',
               'summary', 'Your account is NOT rejected. Please retry face verification because the media upload did not complete.'
             )
           ),
           admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes,'')),''), '[needs_retry] auto-healed blank/upload-pending under_review submission'),
           updated_at = now()
      FROM stuck_blank b
     WHERE s.id = b.id
    RETURNING s.id, s.user_id
  )
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  SELECT u.user_id,
         'face_verification_retry',
         'Verification Upload Incomplete',
         'Your face verification media did not finish uploading. Please retry your photo, video, and live face scan in good light.',
         jsonb_build_object('action_url','/face-verification','route','/face-verification','reason','upload_incomplete','submission_id',u.id),
         false
    FROM upd u;

  GET DIAGNOSTICS retried = ROW_COUNT;
  RETURN requeued + retried;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_heal_stuck_face_verifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_heal_stuck_face_verifications(integer) TO authenticated, service_role;

-- Kick the currently stuck rows now that the queue/auth path is fixed.
SELECT public.service_heal_stuck_face_verifications(30);