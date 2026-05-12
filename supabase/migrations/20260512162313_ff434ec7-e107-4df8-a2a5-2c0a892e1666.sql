CREATE OR REPLACE FUNCTION public.notify_direct_message_to_receiver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recipient_id uuid;
  v_sender_name text;
  v_body text;
BEGIN
  SELECT CASE
           WHEN c.participant1_id = NEW.sender_id THEN c.participant2_id
           ELSE c.participant1_id
         END
  INTO v_recipient_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id
    AND (c.participant1_id = NEW.sender_id OR c.participant2_id = NEW.sender_id);

  IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Someone')
  INTO v_sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  v_body := CASE COALESCE(NEW.message_type, 'text')
    WHEN 'audio' THEN 'Voice message'
    WHEN 'voice' THEN 'Voice message'
    WHEN 'image' THEN 'Photo message'
    WHEN 'video' THEN 'Video message'
    WHEN 'gift' THEN 'Gift message'
    ELSE LEFT(COALESCE(NEW.content, 'New message'), 160)
  END;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_recipient_id,
    'message',
    COALESCE(v_sender_name, 'Someone'),
    v_body,
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id,
      'sender_id', NEW.sender_id,
      'sender_name', COALESCE(v_sender_name, 'Someone'),
      'message_type', COALESCE(NEW.message_type, 'text'),
      'action_url', '/chat?conversation=' || NEW.conversation_id::text
    ),
    false,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_direct_message_to_receiver ON public.messages;
CREATE TRIGGER trigger_notify_direct_message_to_receiver
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_direct_message_to_receiver();

CREATE OR REPLACE FUNCTION public.notify_private_call_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_name text;
  v_call_type text;
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Caller')
  INTO v_caller_name
  FROM public.profiles
  WHERE id = NEW.caller_id;

  v_call_type := COALESCE(NEW.call_type, 'video');

  IF TG_OP = 'INSERT' AND lower(COALESCE(NEW.status, '')) IN ('ringing', 'pending') THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (
      NEW.host_id,
      'call_received',
      'Incoming Call',
      COALESCE(v_caller_name, 'Caller') || ' is calling you',
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
$$;

DROP TRIGGER IF EXISTS trigger_notify_private_call_insert ON public.private_calls;
CREATE TRIGGER trigger_notify_private_call_insert
AFTER INSERT ON public.private_calls
FOR EACH ROW
EXECUTE FUNCTION public.notify_private_call_events();

DROP TRIGGER IF EXISTS trigger_notify_private_call_update ON public.private_calls;
CREATE TRIGGER trigger_notify_private_call_update
AFTER UPDATE OF status ON public.private_calls
FOR EACH ROW
EXECUTE FUNCTION public.notify_private_call_events();