CREATE OR REPLACE FUNCTION public._enqueue_face_analyze(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_secret text;
  v_url text;
  v_anon text;
  v_request_id bigint;
  v_status text;
  v_bucket text;
  v_upload_pending boolean;
  v_retry_required boolean;
BEGIN
  IF _submission_id IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(trim(coalesce(status, ''))),
         public.face_verification_status_bucket(status),
         COALESCE((ai_analysis->>'upload_pending')::boolean, false),
         COALESCE((ai_analysis->>'requires_resubmit')::boolean, false) OR (ai_analysis ? 'retry_required')
    INTO v_status, v_bucket, v_upload_pending, v_retry_required
  FROM public.face_verification_submissions
  WHERE id = _submission_id;

  IF v_bucket IS NULL THEN
    RETURN;
  END IF;

  IF v_bucket <> 'pending' OR v_retry_required THEN
    INSERT INTO public.face_verification_analysis_jobs(submission_id, status, completed_at, locked_at, last_error, next_run_at)
    VALUES (_submission_id, 'completed', now(), NULL, CASE WHEN v_retry_required THEN 'awaiting_user_retry' ELSE NULL END, now())
    ON CONFLICT (submission_id) DO UPDATE
      SET status = 'completed',
          completed_at = coalesce(public.face_verification_analysis_jobs.completed_at, now()),
          locked_at = NULL,
          last_error = CASE WHEN v_retry_required THEN 'awaiting_user_retry' ELSE NULL END,
          updated_at = now();
    RETURN;
  END IF;

  SELECT setting_value INTO v_secret
  FROM public.app_settings
  WHERE setting_key = 'face_cron_secret'
  LIMIT 1;

  SELECT COALESCE(
    (SELECT setting_value FROM public.app_settings WHERE setting_key = 'face_verification_analyze_url' LIMIT 1),
    current_setting('app.settings.supabase_url', true) || '/functions/v1/face-verification-analyze',
    'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/face-verification-analyze'
  ) INTO v_url;

  SELECT COALESCE(
    (SELECT setting_value FROM public.app_settings WHERE setting_key = 'supabase_anon_key' LIMIT 1),
    current_setting('app.settings.supabase_anon_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc'
  ) INTO v_anon;

  INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
  VALUES
    ('face_verification_analyze_url', v_url, 'Face verification analyzer edge function URL used by the database enqueue job.', now()),
    ('supabase_anon_key', v_anon, 'Publishable Supabase anon key used by database-triggered edge function jobs.', now())
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        description = COALESCE(public.app_settings.description, EXCLUDED.description),
        updated_at = now();

  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at, last_error, completed_at, locked_at)
  VALUES (
    _submission_id,
    'queued',
    CASE WHEN v_upload_pending THEN now() + interval '30 seconds' ELSE now() END,
    CASE
      WHEN v_upload_pending THEN 'upload_pending'
      WHEN v_secret IS NULL OR length(trim(v_secret)) = 0 THEN 'face_cron_secret_missing'
      WHEN v_url IS NULL OR length(trim(v_url)) = 0 THEN 'face_analyze_url_missing'
      WHEN v_anon IS NULL OR length(trim(v_anon)) = 0 THEN 'supabase_anon_key_missing'
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
          WHEN v_url IS NULL OR length(trim(v_url)) = 0 THEN 'face_analyze_url_missing'
          WHEN v_anon IS NULL OR length(trim(v_anon)) = 0 THEN 'supabase_anon_key_missing'
          ELSE NULL
        END,
        completed_at = NULL,
        locked_at = NULL,
        updated_at = now();

  IF v_upload_pending OR v_secret IS NULL OR length(trim(v_secret)) = 0 OR v_url IS NULL OR length(trim(v_url)) = 0 OR v_anon IS NULL OR length(trim(v_anon)) = 0 THEN
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