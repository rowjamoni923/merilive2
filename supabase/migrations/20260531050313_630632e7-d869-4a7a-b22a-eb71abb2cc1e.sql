CREATE OR REPLACE FUNCTION public.notify_private_call_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_name text;
  v_call_type text := 'video';
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Caller')
  INTO v_caller_name
  FROM public.profiles
  WHERE id = NEW.caller_id;

  IF TG_OP = 'UPDATE'
     AND lower(COALESCE(OLD.status, '')) IS DISTINCT FROM lower(COALESCE(NEW.status, ''))
     AND lower(COALESCE(NEW.status, '')) = 'missed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (
      NEW.host_id,
      'call_missed',
      'Missed Call',
      'You missed a ' || v_call_type || ' call from ' || COALESCE(v_caller_name, 'Caller'),
      jsonb_build_object(
        'call_id', NEW.id,
        'caller_id', NEW.caller_id,
        'caller_name', COALESCE(v_caller_name, 'Caller'),
        'call_type', v_call_type,
        'action_url', '/call-history'
      ),
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;