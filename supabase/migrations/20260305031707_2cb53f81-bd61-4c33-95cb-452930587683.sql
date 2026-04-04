
-- Trigger: When admin sends a support message, create a notification for the user
CREATE OR REPLACE FUNCTION public.notify_user_on_admin_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket_user_id uuid;
  _ticket_number text;
BEGIN
  -- Only for admin messages
  IF NEW.sender_type <> 'admin' THEN
    RETURN NEW;
  END IF;

  -- Get the ticket owner
  SELECT user_id, ticket_number INTO _ticket_user_id, _ticket_number
  FROM support_tickets
  WHERE id = NEW.ticket_id;

  IF _ticket_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create notification for the user
  INSERT INTO notifications (user_id, type, title, message, metadata)
  VALUES (
    _ticket_user_id,
    'support_reply',
    'Support Reply',
    LEFT(NEW.content, 100),
    jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'message_id', NEW.id,
      'action_url', '/support'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_user_on_admin_reply
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_on_admin_reply();
