-- ============================================================
-- Pkg327: Support tickets & messages UPDATE column allow-list
-- ============================================================

-- 1) support_messages: freeze everything except is_read (only ticket owner)
CREATE OR REPLACE FUNCTION public.tg_guard_support_messages_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_service boolean := false;
BEGIN
  BEGIN
    v_is_service := current_setting('request.jwt.claim.role', true) = 'service_role';
  EXCEPTION WHEN OTHERS THEN v_is_service := false;
  END;
  BEGIN
    v_is_admin := public.is_admin(auth.uid()) OR public.is_active_admin_session();
  EXCEPTION WHEN OTHERS THEN v_is_admin := false;
  END;

  IF v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Ordinary user: only is_read may change, and only to true
  IF NEW.ticket_id          IS DISTINCT FROM OLD.ticket_id
  OR NEW.sender_id          IS DISTINCT FROM OLD.sender_id
  OR NEW.sender_type        IS DISTINCT FROM OLD.sender_type
  OR NEW.sender_sector      IS DISTINCT FROM OLD.sender_sector
  OR NEW.content            IS DISTINCT FROM OLD.content
  OR NEW.attachment_url     IS DISTINCT FROM OLD.attachment_url
  OR NEW.attachment_type    IS DISTINCT FROM OLD.attachment_type
  OR NEW.translated_content IS DISTINCT FROM OLD.translated_content
  OR NEW.original_language  IS DISTINCT FROM OLD.original_language
  OR NEW.voice_transcript   IS DISTINCT FROM OLD.voice_transcript
  OR NEW.support_admin_name IS DISTINCT FROM OLD.support_admin_name
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only is_read may be changed on support messages'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_read IS DISTINCT FROM OLD.is_read AND NEW.is_read = false THEN
    RAISE EXCEPTION 'Cannot un-read a message' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_support_messages_update ON public.support_messages;
CREATE TRIGGER tg_guard_support_messages_update
BEFORE UPDATE ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_support_messages_update();

-- 2) support_tickets: freeze status/priority/assignment fields for non-admin users
CREATE OR REPLACE FUNCTION public.tg_guard_support_tickets_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_service boolean := false;
BEGIN
  BEGIN
    v_is_service := current_setting('request.jwt.claim.role', true) = 'service_role';
  EXCEPTION WHEN OTHERS THEN v_is_service := false;
  END;
  BEGIN
    v_is_admin := public.is_admin(auth.uid()) OR public.is_active_admin_session();
  EXCEPTION WHEN OTHERS THEN v_is_admin := false;
  END;

  IF v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Ordinary user (must already be ticket owner per RLS):
  -- only subject + category may change (re-classify before admin picks it up).
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

DROP TRIGGER IF EXISTS tg_guard_support_tickets_update ON public.support_tickets;
CREATE TRIGGER tg_guard_support_tickets_update
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_support_tickets_update();