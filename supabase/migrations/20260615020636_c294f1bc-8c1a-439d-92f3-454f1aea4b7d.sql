-- 1) Don't create an in-app notification row for DM gift messages.
--    Push notifications (Android) and the chat thread itself are untouched.
CREATE OR REPLACE FUNCTION public.notify_direct_message_to_receiver()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient_id uuid;
  v_sender_name text;
  v_body text;
BEGIN
  -- Gifts already render in the chat thread + fire as a push notification.
  -- Do NOT pollute the in-app Notifications tab with them.
  IF COALESCE(NEW.message_type, 'text') = 'gift' THEN
    RETURN NEW;
  END IF;

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
$function$;

-- 2) Clean up existing gift notifications that already polluted the tab.
DELETE FROM public.notifications
 WHERE type = 'message'
   AND COALESCE(data->>'message_type', '') = 'gift';