-- Create the weekly agency transfer cron job
SELECT cron.schedule(
  'weekly-agency-transfer',
  '0 0 * * 0', -- Every Sunday at midnight UTC
  $$
  SELECT
    net.http_post(
        url:='https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/agency-weekly-transfer',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw'
        ),
        body:=jsonb_build_object('time', now()::text, 'type', 'scheduled')
    ) AS request_id;
  $$
);