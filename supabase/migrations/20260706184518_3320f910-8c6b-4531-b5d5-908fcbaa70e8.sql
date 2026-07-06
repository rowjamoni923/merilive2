CREATE OR REPLACE FUNCTION public._enqueue_face_analyze(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_secret text;
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/face-verification-analyze';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';
  v_request_id bigint;
BEGIN
  IF _submission_id IS NULL THEN
    RETURN;
  END IF;

  SELECT setting_value INTO v_secret
  FROM public.app_settings
  WHERE setting_key = 'face_cron_secret'
  LIMIT 1;

  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at, last_error)
  VALUES (_submission_id, 'queued', now(), CASE WHEN v_secret IS NULL OR length(trim(v_secret)) = 0 THEN 'face_cron_secret_missing' ELSE NULL END)
  ON CONFLICT (submission_id) DO UPDATE
    SET status = CASE WHEN public.face_verification_analysis_jobs.status = 'completed' THEN 'completed' ELSE 'queued' END,
        next_run_at = CASE WHEN public.face_verification_analysis_jobs.status = 'completed' THEN public.face_verification_analysis_jobs.next_run_at ELSE now() END,
        last_error = CASE WHEN v_secret IS NULL OR length(trim(v_secret)) = 0 THEN 'face_cron_secret_missing' ELSE public.face_verification_analysis_jobs.last_error END,
        updated_at = now();

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon,
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