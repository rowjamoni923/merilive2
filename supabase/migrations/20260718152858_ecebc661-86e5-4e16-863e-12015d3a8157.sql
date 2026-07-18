CREATE OR REPLACE FUNCTION public._enqueue_face_analyze(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_secret text;
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/face-verification-analyze';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';
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

  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at, last_error, completed_at, locked_at)
  VALUES (
    _submission_id,
    'queued',
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

CREATE OR REPLACE FUNCTION public.sweep_pending_face_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
  v_refinalized integer := 0;
  v_healed integer := 0;
BEGIN
  UPDATE public.face_verification_submissions
     SET status = 'under_review',
         ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) - 'analyzer_status' - 'analyzer_locked_at' - 'analyzer_locked_until' || jsonb_build_object('processing_state_recovered_by_sweeper', true),
         updated_at = now()
   WHERE status = 'processing'
     AND COALESCE(updated_at, created_at) < now() - interval '2 minutes';

  UPDATE public.face_verification_submissions
     SET ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) - 'analyzer_status' - 'analyzer_locked_at' - 'analyzer_locked_until' || jsonb_build_object('stale_under_review_recovered_by_sweeper', true),
         updated_at = now()
   WHERE status = 'under_review'
     AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
     AND (
       COALESCE(ai_analysis->>'analyzer_status', '') = 'processing'
       OR ai_analysis ? 'analyzer_locked_until'
     )
     AND COALESCE(updated_at, created_at) < now() - interval '2 minutes';

  UPDATE public.face_verification_analysis_jobs j
     SET last_http_status = r.status_code,
         last_error = COALESCE(r.error_msg, CASE WHEN r.status_code >= 400 THEN left(coalesce(r.content,''), 500) ELSE NULL END),
         status = CASE
           WHEN r.status_code BETWEEN 200 AND 299 THEN j.status
           WHEN j.attempts >= 5 THEN 'failed'
           ELSE 'queued'
         END,
         next_run_at = CASE
           WHEN r.status_code BETWEEN 200 AND 299 THEN j.next_run_at
           ELSE now() + make_interval(mins => LEAST(10, GREATEST(1, j.attempts + 1)))
         END,
         updated_at = now()
    FROM net._http_response r
   WHERE j.last_request_id = r.id
     AND j.status IN ('queued','processing')
     AND (j.last_http_status IS DISTINCT FROM r.status_code OR j.last_error IS DISTINCT FROM r.error_msg);

  UPDATE public.face_verification_analysis_jobs j
     SET status = 'completed',
         completed_at = coalesce(j.completed_at, now()),
         locked_at = NULL,
         last_error = 'awaiting_user_retry',
         updated_at = now()
    FROM public.face_verification_submissions s
   WHERE s.id = j.submission_id
     AND public.face_verification_status_bucket(s.status) = 'user_retry'
     AND (COALESCE((s.ai_analysis->>'requires_resubmit')::boolean, false) OR s.ai_analysis ? 'retry_required')
     AND j.status <> 'completed';

  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at)
  SELECT s.id, 'queued', now()
  FROM public.face_verification_submissions s
  WHERE public.face_verification_status_bucket(s.status) = 'pending'
    AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
    AND NOT (COALESCE((s.ai_analysis->>'requires_resubmit')::boolean, false) OR s.ai_analysis ? 'retry_required')
    AND s.created_at > now() - interval '30 days'
    AND COALESCE(s.profile_photo_url, s.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NOT NULL
    AND COALESCE(s.front_url, s.selfie_url, s.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NOT NULL
    AND COALESCE(s.face_image_url, s.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NOT NULL
    AND (
      s.ai_analysis IS NULL
      OR NOT (s.ai_analysis ? 'rekognition')
      OR s.status = 'under_review'
    )
  ON CONFLICT (submission_id) DO UPDATE
    SET status = CASE
          WHEN public.face_verification_analysis_jobs.status = 'completed'
            AND public.face_verification_status_bucket((SELECT status FROM public.face_verification_submissions WHERE id = EXCLUDED.submission_id)) <> 'pending'
          THEN 'completed'
          ELSE 'queued'
        END,
        next_run_at = CASE
          WHEN public.face_verification_analysis_jobs.status = 'completed'
            AND public.face_verification_status_bucket((SELECT status FROM public.face_verification_submissions WHERE id = EXCLUDED.submission_id)) <> 'pending'
          THEN public.face_verification_analysis_jobs.next_run_at
          ELSE now()
        END,
        completed_at = CASE
          WHEN public.face_verification_analysis_jobs.status = 'completed'
            AND public.face_verification_status_bucket((SELECT status FROM public.face_verification_submissions WHERE id = EXCLUDED.submission_id)) <> 'pending'
          THEN public.face_verification_analysis_jobs.completed_at
          ELSE NULL
        END,
        updated_at = now();

  FOR r IN
    SELECT j.submission_id AS id
    FROM public.face_verification_analysis_jobs j
    JOIN public.face_verification_submissions s ON s.id = j.submission_id
    WHERE j.status IN ('queued','processing','failed')
      AND j.attempts < 6
      AND j.next_run_at <= now()
      AND public.face_verification_status_bucket(s.status) = 'pending'
      AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
      AND NOT (COALESCE((s.ai_analysis->>'requires_resubmit')::boolean, false) OR s.ai_analysis ? 'retry_required')
      AND (
        s.ai_analysis IS NULL
        OR NOT (s.ai_analysis ? 'rekognition')
        OR s.status = 'under_review'
      )
    ORDER BY j.created_at ASC
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public._enqueue_face_analyze(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.face_verification_analysis_jobs
         SET status = 'queued', last_error = SQLERRM, next_run_at = now() + interval '1 minute', updated_at = now()
       WHERE submission_id = r.id;
    END;
  END LOOP;

  FOR r IN
    SELECT id
    FROM public.face_verification_submissions
    WHERE public.face_verification_status_bucket(status) = 'pending'
      AND ai_analysis IS NOT NULL
      AND (ai_analysis ? 'rekognition')
      AND created_at > now() - interval '30 days'
    ORDER BY updated_at DESC
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public.service_auto_finalize_face_verification(r.id);
      v_refinalized := v_refinalized + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  BEGIN
    v_healed := public.service_heal_stuck_face_verifications(75);
  EXCEPTION WHEN OTHERS THEN v_healed := 0;
  END;

  RETURN v_count + v_refinalized + coalesce(v_healed, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_pending_face_verifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_pending_face_verifications() TO service_role;

UPDATE public.face_verification_analysis_jobs j
   SET status = 'completed',
       completed_at = coalesce(j.completed_at, now()),
       locked_at = NULL,
       last_error = 'awaiting_user_retry',
       updated_at = now()
  FROM public.face_verification_submissions s
 WHERE s.id = j.submission_id
   AND public.face_verification_status_bucket(s.status) = 'user_retry'
   AND (COALESCE((s.ai_analysis->>'requires_resubmit')::boolean, false) OR s.ai_analysis ? 'retry_required');