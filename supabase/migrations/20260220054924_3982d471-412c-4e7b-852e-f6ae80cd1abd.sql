
-- First, clean up the currently stale stream
SELECT cleanup_stale_live_streams();

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a cron job that runs every 30 seconds to clean up stale streams
-- pg_cron minimum is 1 minute, so we use that
SELECT cron.schedule(
  'cleanup-stale-live-streams',
  '* * * * *',  -- every minute
  $$SELECT cleanup_stale_live_streams()$$
);
