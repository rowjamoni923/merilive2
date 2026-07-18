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
    INSERT INTO public.face_verification_analysis_jobs(submission_id, status, attempts, locked_at, last_error, next_run_at)
    VALUES (p_submission_id, 'processing', 1, now(), NULL, now() + interval '2 minutes')
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

  INSERT INTO public.face_verification_analysis_jobs(submission_id, status, next_run_at)
  SELECT s.id, 'queued', now()
  FROM public.face_verification_submissions s
  WHERE public.face_verification_status_bucket(s.status) IN ('pending','user_retry')
    AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
    AND s.created_at > now() - interval '30 days'
    AND COALESCE(s.profile_photo_url, s.ai_analysis #>> '{evidence_urls,profile_photo_url}') IS NOT NULL
    AND COALESCE(s.front_url, s.selfie_url, s.ai_analysis #>> '{evidence_urls,live_face_scan_url}') IS NOT NULL
    AND COALESCE(s.face_image_url, s.ai_analysis #>> '{evidence_urls,face_video_frame_url}') IS NOT NULL
    AND (
      s.ai_analysis IS NULL
      OR NOT (s.ai_analysis ? 'rekognition')
      OR s.status = 'under_review'
      OR public.face_verification_status_bucket(s.status) = 'user_retry'
    )
  ON CONFLICT (submission_id) DO UPDATE
    SET status = CASE
          WHEN public.face_verification_analysis_jobs.status = 'completed'
            AND public.face_verification_status_bucket((SELECT status FROM public.face_verification_submissions WHERE id = EXCLUDED.submission_id)) <> 'user_retry'
          THEN 'completed'
          ELSE 'queued'
        END,
        next_run_at = CASE
          WHEN public.face_verification_analysis_jobs.status = 'completed'
            AND public.face_verification_status_bucket((SELECT status FROM public.face_verification_submissions WHERE id = EXCLUDED.submission_id)) <> 'user_retry'
          THEN public.face_verification_analysis_jobs.next_run_at
          ELSE now()
        END,
        updated_at = now();

  FOR r IN
    SELECT j.submission_id AS id
    FROM public.face_verification_analysis_jobs j
    JOIN public.face_verification_submissions s ON s.id = j.submission_id
    WHERE j.status IN ('queued','processing','failed')
      AND j.attempts < 6
      AND j.next_run_at <= now()
      AND public.face_verification_status_bucket(s.status) IN ('pending','user_retry')
      AND COALESCE((s.ai_analysis->>'upload_pending')::boolean, false) = false
      AND (
        s.ai_analysis IS NULL
        OR NOT (s.ai_analysis ? 'rekognition')
        OR s.status = 'under_review'
        OR public.face_verification_status_bucket(s.status) = 'user_retry'
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