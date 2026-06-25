
CREATE OR REPLACE FUNCTION public.tg_app_sync_support_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.support_tickets WHERE id = NEW.ticket_id;
  -- Notify ticket owner whenever the inserter isn't them.
  -- Admin replies insert with sender_id = NULL → previous `v_owner <> NEW.sender_id`
  -- evaluated to NULL and skipped the notification (live chat appeared frozen
  -- until the user manually reloaded). Treat NULL sender as "not the owner".
  IF v_owner IS NOT NULL
     AND (NEW.sender_id IS NULL OR NEW.sender_id <> v_owner)
  THEN
    PERFORM public.emit_app_sync_notification(
      v_owner,
      'support_messages',
      TG_OP,
      NEW.id::text,
      jsonb_build_object(
        'ticket_id', NEW.ticket_id,
        'sender_type', NEW.sender_type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
