
-- Use correct timestamp columns: sampled_at / snapshot_at / bucket_hour
DELETE FROM public.cost_monitor_samples WHERE sampled_at < now() - interval '7 days';
DELETE FROM public.cost_monitor_snapshots WHERE snapshot_at < now() - interval '30 days';
DELETE FROM public.admin_broadcast_rate_counter WHERE bucket_hour < now() - interval '7 days';

CREATE INDEX IF NOT EXISTS idx_cost_monitor_samples_sampled_at_desc
  ON public.cost_monitor_samples (sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_monitor_snapshots_snapshot_at_desc
  ON public.cost_monitor_snapshots (snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at_desc
  ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_broadcast_rate_counter_bucket_hour
  ON public.admin_broadcast_rate_counter (bucket_hour);

ANALYZE public.cost_monitor_samples;
ANALYZE public.cost_monitor_snapshots;
ANALYZE public.admin_broadcast_rate_counter;
ANALYZE public.notifications;

CREATE OR REPLACE FUNCTION public.cleanup_monitoring_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.cost_monitor_samples       WHERE sampled_at  < now() - interval '7 days';
  DELETE FROM public.cost_monitor_snapshots     WHERE snapshot_at < now() - interval '30 days';
  DELETE FROM public.admin_broadcast_rate_counter WHERE bucket_hour < now() - interval '7 days';
END;
$$;

SELECT cron.unschedule('cleanup-monitoring-tables-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-monitoring-tables-daily');

SELECT cron.schedule(
  'cleanup-monitoring-tables-daily',
  '30 3 * * *',
  $$SELECT public.cleanup_monitoring_tables();$$
);
