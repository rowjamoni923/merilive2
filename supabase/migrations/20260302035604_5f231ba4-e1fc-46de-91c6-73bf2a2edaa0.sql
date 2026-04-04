
-- Remove old broken cron job that calls SQL function
SELECT cron.unschedule('auto-distribute-leaderboard-rewards');

-- Create new cron job that calls the working edge function
-- Runs every hour (idempotent - won't distribute twice for same period)
SELECT cron.schedule(
  'leaderboard-rewards-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/leaderboard-rewards',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw"}'::jsonb,
      body:='{"time": "scheduled"}'::jsonb
    ) AS request_id;
  $$
);
