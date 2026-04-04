
-- Drop the old cron job that runs every minute (job ID 4)
SELECT cron.unschedule(4);

-- Recreate the function with a statement timeout guard
CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE live_streams
  SET is_active = false, ended_at = now()
  WHERE is_active = true
    AND last_heartbeat < now() - interval '60 seconds';
  
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

-- Reschedule to run every 5 minutes instead of every minute
SELECT cron.schedule(
  'cleanup-stale-live-streams',
  '*/5 * * * *',
  'SELECT cleanup_stale_live_streams()'
);
