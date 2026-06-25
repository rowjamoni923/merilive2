CREATE OR REPLACE FUNCTION public.notify_user_on_admin_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  ticket_user_id uuid;
BEGIN
  IF NEW.sender_type = 'admin' THEN
    SELECT user_id INTO ticket_user_id FROM support_tickets WHERE id = NEW.ticket_id;
    IF ticket_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (ticket_user_id, 'support_reply', 'Support Reply 💬',
        'You have a new reply on your support ticket',
        jsonb_build_object('ticket_id', NEW.ticket_id, 'message_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

UPDATE public.notifications
SET title = 'Support Reply 💬',
    message = 'You have a new reply on your support ticket'
WHERE type = 'support_reply'
  AND (title LIKE '%সাপোর্ট%' OR message LIKE '%টিকেট%' OR message LIKE '%রিপ্লাই%');