CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/send-push-notification';
  v_image text;
  v_type text;
BEGIN
  -- Pkg84: incoming_call rows are inserted by call-deliver edge function purely for in-app
  -- foreground delivery (via useNotifications realtime). The edge function ALREADY sent a
  -- high-priority data-only FCM specifically formatted for the native call screen UI.
  -- Skipping the generic push here prevents a duplicate, generic notification banner from
  -- firing on top of the proper call invite.
  IF NEW.type = 'incoming_call' THEN
    RETURN NEW;
  END IF;

  v_image := NULLIF(NEW.data->>'imageUrl', '');
  IF v_image IS NULL THEN
    v_image := NULLIF(NEW.data->>'image_url', '');
  END IF;
  v_type := COALESCE(NULLIF(NEW.data->>'type',''), NEW.type, 'general');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'imageUrl', v_image,
      'type', v_type,
      'data', COALESCE(NEW.data, '{}'::jsonb) || jsonb_build_object(
        'notification_id', NEW.id,
        'origin', 'notifications_trigger',
        'persist_fallback', false
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;