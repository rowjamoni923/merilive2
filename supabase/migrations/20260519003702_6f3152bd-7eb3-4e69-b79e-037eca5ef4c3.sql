-- Enable pg_cron + pg_net if not yet
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule Swift Pay poll every minute
DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'swift-pay-poll-deposits-every-minute';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'swift-pay-poll-deposits-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/swift-pay-poll-deposits',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc"}'::jsonb,
    body := jsonb_build_object('source','cron','at', now())
  );
  $$
);