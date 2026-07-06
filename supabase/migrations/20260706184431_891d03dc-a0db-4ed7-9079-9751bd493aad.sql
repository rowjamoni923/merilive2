-- Face verification auto-approval hardening: durable queue + exact stats

-- 1) Durable queue/observability table for analyzer invocations.
CREATE TABLE IF NOT EXISTS public.face_verification_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_request_id bigint,
  last_http_status integer,
  last_error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT face_verification_analysis_jobs_status_check CHECK (status IN ('queued','processing','completed','failed')),
  CONSTRAINT face_verification_analysis_jobs_unique_submission UNIQUE (submission_id)
);

GRANT SELECT ON public.face_verification_analysis_jobs TO authenticated;
GRANT ALL ON public.face_verification_analysis_jobs TO service_role;

ALTER TABLE public.face_verification_analysis_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view face analysis jobs" ON public.face_verification_analysis_jobs;
CREATE POLICY "Admins can view face analysis jobs"
ON public.face_verification_analysis_jobs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage face analysis jobs" ON public.face_verification_analysis_jobs;
CREATE POLICY "Service role can manage face analysis jobs"
ON public.face_verification_analysis_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_face_verification_analysis_jobs_updated_at ON public.face_verification_analysis_jobs;
CREATE TRIGGER update_face_verification_analysis_jobs_updated_at
BEFORE UPDATE ON public.face_verification_analysis_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Exact auto/manual review detector used by stats pages.
CREATE OR REPLACE FUNCTION public.is_face_verification_auto_reviewed(
  _status text,
  _verification_method text,
  _ai_analysis jsonb,
  _admin_notes text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN public.face_verification_status_bucket(_status) NOT IN ('approved','rejected') THEN false
    WHEN lower(trim(coalesce(_verification_method, ''))) LIKE 'auto%' THEN true
    WHEN lower(trim(coalesce(_ai_analysis->>'auto_decision', ''))) IN ('approved','rejected') THEN true
    WHEN lower(trim(coalesce(_ai_analysis #>> '{auto_finalize,method}', ''))) LIKE 'auto%' THEN true
    WHEN lower(trim(coalesce(_admin_notes, ''))) LIKE '%[auto]%' THEN true
    WHEN lower(trim(coalesce(_admin_notes, ''))) LIKE '%[auto-reject]%' THEN true
    WHEN lower(trim(coalesce(_admin_notes, ''))) LIKE '%service_auto_finalize_face_verification%' THEN true
    ELSE false
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_face_verification_auto_reviewed(text,text,jsonb,text) TO authenticated, service_role;

-- 3) Non-destructive analyzer lock with completed-job awareness.
CREATE OR REPLACE FUNCTION public.try_lock_face_submission_for_analysis(p_submission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _affected integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.face_verification_submissions
    WHERE id = p_submission_id
      AND public.face_verification_status_bucket(status) <> 'pending'
  ) THEN
    UPDATE public.face_verification_analysis_jobs
       SET status = 'completed',
           completed_at = coalesce(completed_at, now()),
           last_error = NULL,
           updated_at = now()
     WHERE submission_id = p_submission_id;
    RETURN false;
  END IF;

  UPDATE public.face_verification_submissions
     SET rekognition_attempts = COALESCE(rekognition_attempts, 0) + 1,
         ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || jsonb_build_object(
           'analyzer_status', 'processing',
           'analyzer_locked_at', now(),
           'analyzer_locked_until', now() + interval '2 minutes'
         ),
         updated_at = now()
   WHERE id = p_submission_id
     AND public.face_verification_status_bucket(status) = 'pending'
     AND COALESCE((ai_analysis->>'upload_pending')::boolean, false) = false
     AND (
       COALESCE(ai_analysis->>'analyzer_status', '') <> 'processing'
       OR NULLIF(ai_analysis->>'analyzer_locked_until', '') IS NULL
       OR (NULLIF(ai_analysis->>'analyzer_locked_until', ''))::timestamptz < now()
       OR COALESCE(updated_at, created_at) < now() - interval '2 minutes'
     );
  GET DIAGNOSTICS _affected = ROW_COUNT;

  IF _affected > 0 THEN
    INSERT INTO public.face_verification_analysis_jobs(submission_id, status, attempts, locked_at, last_error, next_run_at)
    VALUES (p_submission_id, 'processing', 1, now(), NULL, now() + interval '2 minutes')
    ON CONFLICT (submission_id) DO UPDATE
      SET status = 'processing',
          attempts = public.face_verification_analysis_jobs.attempts + 1,
          locked_at = now(),
          last_error = NULL,
          next_run_at = now() + interval '2 minutes',
          updated_at = now();
  END IF;

  RETURN _affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) TO service_role;

-- 4) Queue analyzer invocations with enough timeout for Rekognition and record request ids.
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

-- 5) Trigger on inserts now requires complete minimum evidence and queues exactly once.
CREATE OR REPLACE FUNCTION public.tg_face_submission_auto_analyze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_upload_pending boolean;
BEGIN
  IF public.face_verification_status_bucket(NEW.status) <> 'pending' THEN
    RETURN NEW;
  END IF;

  v_upload_pending := COALESCE((NEW.ai_analysis->>'upload_pending')::boolean, false);

  IF NOT v_upload_pending
     AND COALESCE(NEW.profile_photo_url, NEW.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NOT NULL
     AND COALESCE(NEW.front_url, NEW.selfie_url, NEW.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NOT NULL
     AND COALESCE(NEW.face_image_url, NEW.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NOT NULL THEN
    BEGIN
      PERFORM public._enqueue_face_analyze(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.face_verification_analysis_jobs(submission_id, status, last_error, next_run_at)
      VALUES (NEW.id, 'queued', SQLERRM, now() + interval '1 minute')
      ON CONFLICT (submission_id) DO UPDATE
        SET status = 'queued', last_error = SQLERRM, next_run_at = now() + interval '1 minute', updated_at = now();
    END;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_face_submission_uploads_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_upload_pending boolean;
  v_ready boolean;
BEGIN
  IF public.face_verification_status_bucket(NEW.status) <> 'pending' THEN
    RETURN NEW;
  END IF;

  v_upload_pending := COALESCE((NEW.ai_analysis->>'upload_pending')::boolean, false);
  v_ready := NOT v_upload_pending
    AND COALESCE(NEW.profile_photo_url, NEW.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NOT NULL
    AND COALESCE(NEW.front_url, NEW.selfie_url, NEW.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NOT NULL
    AND COALESCE(NEW.face_image_url, NEW.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NOT NULL;

  IF v_ready AND (
    COALESCE(OLD.profile_photo_url, OLD.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NULL
    OR COALESCE(OLD.front_url, OLD.selfie_url, OLD.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NULL
    OR COALESCE(OLD.face_image_url, OLD.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NULL
    OR COALESCE((OLD.ai_analysis->>'upload_pending')::boolean, false) = true
    OR COALESCE(NEW.rekognition_attempts, 0) = 0
  ) THEN
    BEGIN
      PERFORM public._enqueue_face_analyze(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.face_verification_analysis_jobs(submission_id, status, last_error, next_run_at)
      VALUES (NEW.id, 'queued', SQLERRM, now() + interval '1 minute')
      ON CONFLICT (submission_id) DO UPDATE
        SET status = 'queued', last_error = SQLERRM, next_run_at = now() + interval '1 minute', updated_at = now();
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- 6) Mark queue completed at terminal decisions.
CREATE OR REPLACE FUNCTION public.tg_face_analysis_job_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF public.face_verification_status_bucket(NEW.status) IN ('approved','rejected','user_retry') THEN
    UPDATE public.face_verification_analysis_jobs
       SET status = 'completed',
           completed_at = now(),
           last_error = NULL,
           updated_at = now()
     WHERE submission_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_face_analysis_job_complete ON public.face_verification_submissions;
CREATE TRIGGER trg_face_analysis_job_complete
AFTER INSERT OR UPDATE OF status ON public.face_verification_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_face_analysis_job_complete();

-- 7) Sweeper retries queued/timed-out jobs and re-finalizes analyzed rows.
CREATE OR REPLACE FUNCTION public.sweep_pending_face_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  -- Pull pg_net results back into job records for observability.
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

  -- Queue complete rows that still have no Rekognition block.
  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at)
  SELECT s.id, 'queued', now()
  FROM public.face_verification_submissions s
  WHERE public.face_verification_status_bucket(s.status) = 'pending'
    AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
    AND s.created_at > now() - interval '7 days'
    AND COALESCE(s.profile_photo_url, s.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NOT NULL
    AND COALESCE(s.front_url, s.selfie_url, s.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NOT NULL
    AND COALESCE(s.face_image_url, s.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NOT NULL
    AND (s.ai_analysis IS NULL OR NOT (s.ai_analysis ? 'rekognition'))
  ON CONFLICT (submission_id) DO UPDATE
    SET status = CASE WHEN public.face_verification_analysis_jobs.status = 'completed' THEN 'completed' ELSE 'queued' END,
        next_run_at = CASE WHEN public.face_verification_analysis_jobs.status = 'completed' THEN public.face_verification_analysis_jobs.next_run_at ELSE now() END,
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
      AND (s.ai_analysis IS NULL OR NOT (s.ai_analysis ? 'rekognition'))
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
      AND created_at > now() - interval '7 days'
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

-- 8) Host stats now exposes exact auto/manual buckets.
CREATE OR REPLACE FUNCTION public.admin_host_application_stats(_search text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r jsonb;
  v_q text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(
        coalesce(s.created_at, '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.reviewed_at, '-infinity'::timestamptz)
      ) DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.is_face_verification_auto_reviewed(s.status, s.verification_method, s.ai_analysis, s.admin_notes) AS is_auto_reviewed,
      (
        lower(trim(coalesce(s.verification_type, ''))) = 'host'
        OR p.is_host IS TRUE
        OR lower(trim(coalesce(p.gender, ''))) = 'female'
        OR coalesce(array_length(s.host_photos, 1), 0) > 0
        OR nullif(trim(coalesce(s.video_url, '')), '') IS NOT NULL
        OR coalesce(s.ai_analysis->'evidence_required', '[]'::jsonb) ? 'host_gallery_photos'
      ) AS is_host_application
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE (v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%')
  ), host_apps AS (
    SELECT * FROM scoped WHERE is_host_application
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'under_review', count(*) FILTER (WHERE status_bucket = 'pending'),
    'user_retry', count(*) FILTER (WHERE status_bucket = 'user_retry'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'auto_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND is_auto_reviewed),
    'auto_host', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_user', 0,
    'auto_face_verification', count(*) FILTER (WHERE status_bucket IN ('approved','rejected') AND is_auto_reviewed),
    'manual_pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'manual_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND NOT is_auto_reviewed),
    'manual_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND NOT is_auto_reviewed),
    'manual_total', count(*) FILTER (WHERE status_bucket = 'pending' OR (status_bucket IN ('approved','rejected') AND NOT is_auto_reviewed)),
    'total', count(*) FILTER (WHERE status_bucket <> 'user_retry')
  ) INTO r FROM host_apps;

  RETURN coalesce(r, jsonb_build_object('pending',0,'under_review',0,'user_retry',0,'approved',0,'rejected',0,'auto_approved',0,'auto_rejected',0,'auto_host',0,'auto_user',0,'auto_face_verification',0,'manual_pending',0,'manual_approved',0,'manual_rejected',0,'manual_total',0,'total',0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_host_application_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.admin_host_application_stats(NULL::text);
$function$;

GRANT EXECUTE ON FUNCTION public.admin_host_application_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_host_application_stats() TO authenticated;

-- 9) Seed the queue for any current complete pending rows; terminal manual approvals remain unchanged.
INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at)
SELECT s.id, 'queued', now()
FROM public.face_verification_submissions s
WHERE public.face_verification_status_bucket(s.status) = 'pending'
  AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
  AND s.created_at > now() - interval '7 days'
  AND COALESCE(s.profile_photo_url, s.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NOT NULL
  AND COALESCE(s.front_url, s.selfie_url, s.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NOT NULL
  AND COALESCE(s.face_image_url, s.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NOT NULL
  AND (s.ai_analysis IS NULL OR NOT (s.ai_analysis ? 'rekognition'))
ON CONFLICT (submission_id) DO NOTHING;