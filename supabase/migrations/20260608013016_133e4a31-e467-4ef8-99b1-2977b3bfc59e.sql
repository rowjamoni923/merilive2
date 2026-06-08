-- ============================================================
-- Phase 3B Step 2 — Schedule call-billing-tick every 60s via pg_cron
-- Calls the call-billing-tick edge function over pg_net (HTTP POST).
-- Idempotent: unschedules any prior job with the same name first.
-- ============================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any pre-existing job with this name (safe if absent)
DO $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'call-billing-tick-every-minute';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

-- Schedule: every minute, POST to the call-billing-tick edge function
SELECT cron.schedule(
  'call-billing-tick-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/call-billing-tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

COMMENT ON EXTENSION pg_cron IS 'pg_cron — billing tick scheduler for private calls (Phase 3B Step 2)';
