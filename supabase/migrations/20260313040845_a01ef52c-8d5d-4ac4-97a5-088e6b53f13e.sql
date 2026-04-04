
-- Schedule re-engagement push notifications every 6 hours
SELECT cron.schedule(
  'send-reengagement-push-every-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/send-reengagement-push',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
