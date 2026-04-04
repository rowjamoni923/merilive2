
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create trigger function to send FCM push via edge function when notification is inserted
CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
  v_payload JSONB;
BEGIN
  -- Skip admin-only types
  IF NEW.type IN ('verification', 'host_application', 'support', 'helper_application', 'helper_upgrade', 'helper_topup', 'new_agency', 'agency_withdrawal', 'admin_alert') THEN
    RETURN NEW;
  END IF;

  -- Build edge function URL
  v_edge_url := rtrim(current_setting('app.settings.supabase_url', true), '/') || '/functions/v1/push-on-notification';
  
  -- If app.settings not available, use direct URL
  IF v_edge_url IS NULL OR v_edge_url = '/functions/v1/push-on-notification' THEN
    v_edge_url := 'https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/push-on-notification';
  END IF;

  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- If service key not available, use the anon key for invocation
  IF v_service_key IS NULL OR v_service_key = '' THEN
    v_service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw';
  END IF;

  v_payload := jsonb_build_object(
    'record', jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'data', COALESCE(NEW.data, '{}'::jsonb)
    )
  );

  -- Fire and forget HTTP POST to edge function
  PERFORM extensions.http_post(
    url := v_edge_url,
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )::jsonb
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't block notification insert if push fails
    RAISE WARNING 'Push notification trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS trigger_push_notification_on_insert ON public.notifications;
CREATE TRIGGER trigger_push_notification_on_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_on_notification();
