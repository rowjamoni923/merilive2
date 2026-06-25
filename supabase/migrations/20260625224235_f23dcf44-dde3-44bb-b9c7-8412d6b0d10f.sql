CREATE OR REPLACE FUNCTION public.tg_guard_support_tickets_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_service boolean := false;
  v_support_touch_ticket_id text := current_setting('app.support_user_message_touch_ticket_id', true);
  v_system_touch text := current_setting('app.support_ticket_system_touch', true);
BEGIN
  BEGIN
    v_is_service := current_setting('request.jwt.claim.role', true) = 'service_role';
  EXCEPTION WHEN OTHERS THEN
    v_is_service := false;
  END;

  BEGIN
    v_is_admin := public.is_admin(auth.uid()) OR public.is_active_admin_session();
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Trusted nested path: only the support_messages AFTER INSERT trigger sets
  -- both transaction-local flags before touching the ticket. It may only bump
  -- metadata and reopen a non-final ticket to open.
  IF NULLIF(v_support_touch_ticket_id, '') = OLD.id::text
     AND v_system_touch = '1'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.ticket_number IS NOT DISTINCT FROM OLD.ticket_number
     AND NEW.priority IS NOT DISTINCT FROM OLD.priority
     AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
     AND NEW.resolved_at IS NOT DISTINCT FROM OLD.resolved_at
     AND NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at
     AND NEW.sender_sector IS NOT DISTINCT FROM OLD.sender_sector
     AND NEW.user_email IS NOT DISTINCT FROM OLD.user_email
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.subject IS NOT DISTINCT FROM OLD.subject
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND OLD.status NOT IN ('closed', 'resolved')
     AND NEW.status IN (OLD.status, 'open')
  THEN
    RETURN NEW;
  END IF;

  -- Ordinary user (must already be ticket owner per RLS): only subject + category
  -- may change. Status/priority/assignment/closure stay admin/server controlled.
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id
  OR NEW.ticket_number  IS DISTINCT FROM OLD.ticket_number
  OR NEW.status         IS DISTINCT FROM OLD.status
  OR NEW.priority       IS DISTINCT FROM OLD.priority
  OR NEW.assigned_to    IS DISTINCT FROM OLD.assigned_to
  OR NEW.resolved_at    IS DISTINCT FROM OLD.resolved_at
  OR NEW.closed_at      IS DISTINCT FROM OLD.closed_at
  OR NEW.sender_sector  IS DISTINCT FROM OLD.sender_sector
  OR NEW.user_email     IS DISTINCT FROM OLD.user_email
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only subject and category can be changed on your own ticket'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_touch_support_ticket_on_user_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_ticket_id text := current_setting('app.support_user_message_touch_ticket_id', true);
  v_previous_system_touch text := current_setting('app.support_ticket_system_touch', true);
BEGIN
  IF NEW.sender_type = 'user' THEN
    BEGIN
      PERFORM set_config('app.support_user_message_touch_ticket_id', NEW.ticket_id::text, true);
      PERFORM set_config('app.support_ticket_system_touch', '1', true);

      UPDATE public.support_tickets
      SET status = 'open', updated_at = now()
      WHERE id = NEW.ticket_id
        AND status NOT IN ('closed', 'resolved');
    EXCEPTION WHEN OTHERS THEN
      -- Message delivery is critical. A ticket touch is metadata only, so never
      -- rollback the user's chat message because of a status-touch conflict.
      RAISE WARNING 'support ticket touch skipped for ticket %, message %: %', NEW.ticket_id, NEW.id, SQLERRM;
    END;

    PERFORM set_config('app.support_user_message_touch_ticket_id', COALESCE(v_previous_ticket_id, ''), true);
    PERFORM set_config('app.support_ticket_system_touch', COALESCE(v_previous_system_touch, ''), true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_touch_support_ticket_on_user_message ON public.support_messages;
CREATE TRIGGER tg_touch_support_ticket_on_user_message
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_support_ticket_on_user_message();