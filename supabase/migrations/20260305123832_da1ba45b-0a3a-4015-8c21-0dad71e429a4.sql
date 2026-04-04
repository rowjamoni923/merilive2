CREATE OR REPLACE FUNCTION public.notify_user_on_admin_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket_user_id uuid;
  _ticket_number text;
  _ticket_category text;
  _action_url text;
BEGIN
  IF NEW.sender_type <> 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, ticket_number, category
  INTO _ticket_user_id, _ticket_number, _ticket_category
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF _ticket_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF _ticket_category = 'live_chat' THEN
    _action_url := '/settings/customer-service?mode=live_chat&ticket_id=' || NEW.ticket_id::text || '&message_id=' || NEW.id::text;
  ELSE
    _action_url := '/settings/customer-service';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _ticket_user_id,
    'support_reply',
    'Support Reply',
    LEFT(NEW.content, 100),
    jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'message_id', NEW.id,
      'action_url', _action_url
    )
  );

  RETURN NEW;
END;
$$;