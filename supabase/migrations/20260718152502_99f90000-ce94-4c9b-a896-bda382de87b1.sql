CREATE OR REPLACE FUNCTION public.mark_face_analysis_job_done(
  p_submission_id uuid,
  p_success boolean DEFAULT true,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only';
  END IF;

  UPDATE public.face_verification_analysis_jobs
     SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
         completed_at = CASE WHEN p_success THEN now() ELSE completed_at END,
         last_error = NULLIF(p_error, ''),
         last_http_status = CASE WHEN p_success THEN 200 ELSE 500 END,
         locked_at = NULL,
         next_run_at = CASE WHEN p_success THEN next_run_at ELSE now() + interval '1 minute' END,
         updated_at = now()
   WHERE submission_id = p_submission_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_face_analysis_job_done(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_face_analysis_job_done(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public._enqueue_face_analyze(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_secret text;
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/face-verification-analyze';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  v_real_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';
  v_request_id bigint;
  v_bucket text;
  v_upload_pending boolean;
BEGIN
  IF _submission_id IS NULL THEN
    RETURN;
  END IF;

  SELECT public.face_verification_status_bucket(status),
         COALESCE((ai_analysis->>'upload_pending')::boolean, false)
    INTO v_bucket, v_upload_pending
  FROM public.face_verification_submissions
  WHERE id = _submission_id;

  IF v_bucket IS NULL THEN
    RETURN;
  END IF;

  IF v_bucket NOT IN ('pending','user_retry') THEN
    UPDATE public.face_verification_analysis_jobs
       SET status = 'completed', completed_at = coalesce(completed_at, now()), locked_at = NULL, updated_at = now()
     WHERE submission_id = _submission_id;
    RETURN;
  END IF;

  SELECT setting_value INTO v_secret
  FROM public.app_settings
  WHERE setting_key = 'face_cron_secret'
  LIMIT 1;

  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at, last_error, completed_at, locked_at)
  VALUES (
    _submission_id,
    CASE WHEN v_upload_pending THEN 'queued' ELSE 'queued' END,
    CASE WHEN v_upload_pending THEN now() + interval '30 seconds' ELSE now() END,
    CASE
      WHEN v_upload_pending THEN 'upload_pending'
      WHEN v_secret IS NULL OR length(trim(v_secret)) = 0 THEN 'face_cron_secret_missing'
      ELSE NULL
    END,
    NULL,
    NULL
  )
  ON CONFLICT (submission_id) DO UPDATE
    SET status = 'queued',
        next_run_at = CASE WHEN v_upload_pending THEN now() + interval '30 seconds' ELSE now() END,
        last_error = CASE
          WHEN v_upload_pending THEN 'upload_pending'
          WHEN v_secret IS NULL OR length(trim(v_secret)) = 0 THEN 'face_cron_secret_missing'
          ELSE NULL
        END,
        completed_at = NULL,
        locked_at = NULL,
        updated_at = now();

  IF v_upload_pending OR v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_real_anon,
      'Authorization', 'Bearer ' || v_real_anon,
      'x-cron-secret', v_secret
    ),
    body := jsonb_build_object('submissionId', _submission_id),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  UPDATE public.face_verification_analysis_jobs
     SET last_request_id = v_request_id,
         status = 'processing',
         locked_at = now(),
         next_run_at = now() + interval '2 minutes',
         updated_at = now()
   WHERE submission_id = _submission_id
     AND status <> 'completed';
END;
$function$;

REVOKE ALL ON FUNCTION public._enqueue_face_analyze(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._enqueue_face_analyze(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.try_lock_face_submission_for_analysis(p_submission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _affected integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.face_verification_submissions
    WHERE id = p_submission_id
      AND public.face_verification_status_bucket(status) NOT IN ('pending','user_retry')
  ) THEN
    PERFORM public.mark_face_analysis_job_done(p_submission_id, true, NULL);
    RETURN false;
  END IF;

  UPDATE public.face_verification_submissions
     SET rekognition_attempts = COALESCE(rekognition_attempts, 0) + 1,
         ai_analysis = (COALESCE(ai_analysis, '{}'::jsonb) - 'admin_resolution_required') || jsonb_build_object(
           'analyzer_status', 'processing',
           'analyzer_locked_at', now(),
           'analyzer_locked_until', now() + interval '2 minutes'
         ),
         updated_at = now()
   WHERE id = p_submission_id
     AND public.face_verification_status_bucket(status) IN ('pending','user_retry')
     AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
     AND (
       COALESCE(ai_analysis->>'analyzer_status', '') <> 'processing'
       OR NULLIF(ai_analysis->>'analyzer_locked_until', '') IS NULL
       OR (NULLIF(ai_analysis->>'analyzer_locked_until', ''))::timestamptz < now()
       OR COALESCE(updated_at, created_at) < now() - interval '2 minutes'
     );
  GET DIAGNOSTICS _affected = ROW_COUNT;

  IF _affected > 0 THEN
    INSERT INTO public.face_verification_analysis_jobs(submission_id, status, attempts, locked_at, last_error, next_run_at, completed_at)
    VALUES (p_submission_id, 'processing', 1, now(), NULL, now() + interval '2 minutes', NULL)
    ON CONFLICT (submission_id) DO UPDATE
      SET status = 'processing',
          attempts = CASE
            WHEN public.face_verification_analysis_jobs.status = 'completed'
              AND public.face_verification_analysis_jobs.updated_at < now() - interval '5 minutes'
            THEN 1
            ELSE public.face_verification_analysis_jobs.attempts + 1
          END,
          locked_at = now(),
          last_error = NULL,
          next_run_at = now() + interval '2 minutes',
          completed_at = NULL,
          updated_at = now();
  END IF;

  RETURN _affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) TO service_role;

UPDATE public.face_verification_analysis_jobs j
   SET status = 'queued',
       completed_at = NULL,
       locked_at = NULL,
       next_run_at = now(),
       last_error = 'requeued_after_retry_queue_fix',
       updated_at = now()
  FROM public.face_verification_submissions s
 WHERE s.id = j.submission_id
   AND public.face_verification_status_bucket(s.status) = 'user_retry'
   AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false;

SELECT public._enqueue_face_analyze(s.id)
FROM public.face_verification_submissions s
WHERE public.face_verification_status_bucket(s.status) IN ('pending','user_retry')
  AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
  AND s.created_at > now() - interval '30 days'
LIMIT 25;