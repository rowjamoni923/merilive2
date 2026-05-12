CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing job if present (idempotent re-schedule)
DO $$
DECLARE v_jobid INT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'auto-distribute-leaderboard-rewards-hourly';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'auto-distribute-leaderboard-rewards-hourly',
  '5 * * * *',
  $$ SELECT public.auto_distribute_leaderboard_rewards(); $$
);