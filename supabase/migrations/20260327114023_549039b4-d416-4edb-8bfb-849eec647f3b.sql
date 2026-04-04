-- Immediate cost reduction for oversized application log tables
DELETE FROM public.system_error_logs
WHERE created_at < now() - interval '7 days';

DELETE FROM public.session_security_logs
WHERE created_at < now() - interval '14 days';

ALTER TABLE public.system_error_logs SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE public.session_security_logs SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

DO $cleanup$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup-application-logs-daily'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'cleanup-application-logs-daily',
    '15 3 * * *',
    'SELECT public.cleanup_application_logs();'
  );
END
$cleanup$;