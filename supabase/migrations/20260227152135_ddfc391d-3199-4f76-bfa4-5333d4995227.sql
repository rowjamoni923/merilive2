
-- Create trigger to auto-send notification when admin sends helper message
CREATE OR REPLACE FUNCTION public.notify_helper_on_admin_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _helper_user_id uuid;
BEGIN
  -- Get the helper's user_id from topup_helpers table
  SELECT user_id INTO _helper_user_id
  FROM topup_helpers
  WHERE id = NEW.helper_id;

  IF _helper_user_id IS NOT NULL AND NEW.sender_type = 'admin' THEN
    -- Insert into notifications (bypasses RLS via SECURITY DEFINER)
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (
      _helper_user_id,
      'admin_message',
      '📢 ' || COALESCE(NEW.title, 'Admin Message'),
      COALESCE(NEW.message, ''),
      jsonb_build_object(
        'message_id', NEW.id,
        'priority', COALESCE(NEW.priority, 'normal'),
        'source', 'helper_messaging'
      ),
      false
    );

    -- Also insert into helper_notifications for the helper dashboard
    INSERT INTO helper_notifications (helper_id, type, title, message, data, is_read)
    VALUES (
      NEW.helper_id,
      'admin_message',
      '📢 ' || COALESCE(NEW.title, 'Admin Message'),
      COALESCE(NEW.message, ''),
      jsonb_build_object(
        'message_id', NEW.id,
        'priority', COALESCE(NEW.priority, 'normal')
      ),
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_helper_on_admin_message ON helper_admin_messages;
CREATE TRIGGER trg_notify_helper_on_admin_message
  AFTER INSERT ON helper_admin_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_helper_on_admin_message();
