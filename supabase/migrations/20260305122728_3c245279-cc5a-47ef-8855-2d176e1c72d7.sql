CREATE OR REPLACE FUNCTION public.notify_user_on_admin_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _ticket_user_id uuid;
  _ticket_number text;
BEGIN
  IF NEW.sender_type <> 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, ticket_number INTO _ticket_user_id, _ticket_number
  FROM support_tickets
  WHERE id = NEW.ticket_id;

  IF _ticket_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    _ticket_user_id,
    'support_reply',
    'Support Reply',
    LEFT(NEW.content, 100),
    jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'message_id', NEW.id,
      'action_url', '/settings/customer-service'
    )
  );

  RETURN NEW;
END;
$$;