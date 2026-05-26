-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- =====================================================================
-- Helper: enqueue an HTTP POST to face-verification-analyze for one row
-- =====================================================================
CREATE OR REPLACE FUNCTION public._enqueue_face_analyze(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_url    text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/face-verification-analyze';
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';
BEGIN
  IF _submission_id IS NULL THEN RETURN; END IF;

  SELECT setting_value INTO v_secret
  FROM public.app_settings
  WHERE setting_key = 'face_cron_secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    -- Secret not yet provisioned; skip silently. Sweeper will retry.
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'apikey',         v_anon,
      'x-cron-secret',  v_secret
    ),
    body    := jsonb_build_object('submissionId', _submission_id),
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._enqueue_face_analyze(uuid) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- AFTER INSERT trigger: kick off analysis the moment a submission lands
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_face_submission_auto_analyze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only enqueue if we have at least one image URL to analyze and status is fresh.
  IF (COALESCE(NEW.front_url, NEW.face_image_url, NEW.selfie_url) IS NOT NULL)
     AND (COALESCE(NEW.status,'') IN ('submitted','pending')) THEN
    BEGIN
      PERFORM public._enqueue_face_analyze(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Never let trigger break inserts; sweeper will pick it up.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_face_submission_auto_analyze ON public.face_verification_submissions;
CREATE TRIGGER trg_face_submission_auto_analyze
AFTER INSERT ON public.face_verification_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_face_submission_auto_analyze();

-- =====================================================================
-- Sweeper: re-enqueue stale pending submissions older than 30s with no ai_analysis
-- =====================================================================
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
    WHERE COALESCE(status,'') IN ('submitted','pending')
      AND ai_analysis IS NULL
      AND created_at < now() - interval '30 seconds'
      AND created_at > now() - interval '24 hours'  -- don't keep retrying ancient rows
      AND COALESCE(front_url, face_image_url, selfie_url) IS NOT NULL
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

REVOKE EXECUTE ON FUNCTION public.sweep_pending_face_verifications() FROM PUBLIC, anon, authenticated;