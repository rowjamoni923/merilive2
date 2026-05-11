-- Pkg32: Fix master push-on-notification trigger
-- Bug 1: app.settings.edge_function_url is NULL → call URL was "null/send-push-notification"
-- Bug 2: payload used {user_id, message} but edge function expects {userId, body}
-- Bug 3: imageUrl from notifications.data was never forwarded
CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/send-push-notification';
  v_image text;
  v_type text;
BEGIN
  -- Extract optional fields from data jsonb
  v_image := NULLIF(NEW.data->>'imageUrl', '');
  IF v_image IS NULL THEN
    v_image := NULLIF(NEW.data->>'image_url', '');
  END IF;
  v_type := COALESCE(NULLIF(NEW.data->>'type',''), NEW.type, 'general');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'userId', NEW.user_id,           -- correct key (was user_id)
      'title', NEW.title,
      'body', NEW.message,             -- correct key (was message)
      'imageUrl', v_image,
      'type', v_type,
      'data', COALESCE(NEW.data, '{}'::jsonb)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert; log & swallow
  RAISE WARNING 'trigger_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;