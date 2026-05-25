-- ============================================================
-- Pkg327 pass-2: support insert guard, server-side ticket touch,
-- and private attachment read by ticket owner
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_guard_support_messages_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_service boolean := false;
  v_uid uuid := auth.uid();
  v_ticket record;
BEGIN
  BEGIN
    v_is_service := current_setting('request.jwt.claim.role', true) = 'service_role';
  EXCEPTION WHEN OTHERS THEN
    v_is_service := false;
  END;

  BEGIN
    v_is_admin := public.is_admin(v_uid) OR public.is_active_admin_session();
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to send support messages' USING ERRCODE = '42501';
  END IF;

  IF NEW.sender_id IS DISTINCT FROM v_uid OR NEW.sender_type IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'Users can only send their own support messages' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, status
    INTO v_ticket
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF v_ticket.id IS NULL OR v_ticket.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Support ticket not found for this user' USING ERRCODE = '42501';
  END IF;

  IF v_ticket.status IN ('closed', 'resolved') THEN
    RAISE EXCEPTION 'This support ticket is closed. Start a new chat.' USING ERRCODE = '42501';
  END IF;

  NEW.content := trim(COALESCE(NEW.content, ''));
  IF length(NEW.content) = 0 OR length(NEW.content) > 5000 THEN
    RAISE EXCEPTION 'Support message must be between 1 and 5000 characters' USING ERRCODE = '22023';
  END IF;

  IF NEW.attachment_url IS NOT NULL THEN
    NEW.attachment_url := trim(NEW.attachment_url);
    IF NEW.attachment_url ~* '^https?://' OR split_part(NEW.attachment_url, '/', 1) IS DISTINCT FROM v_uid::text THEN
      RAISE EXCEPTION 'Support attachment path must belong to the sender' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(NEW.attachment_type, '') NOT IN ('image', 'voice') THEN
      RAISE EXCEPTION 'Invalid support attachment type' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- User supplied translations/admin metadata are not trusted.
  NEW.translated_content := NULL;
  NEW.original_language := NULL;
  NEW.support_admin_name := NULL;
  NEW.is_read := false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_support_messages_insert ON public.support_messages;
CREATE TRIGGER tg_guard_support_messages_insert
BEFORE INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_support_messages_insert();

CREATE OR REPLACE FUNCTION public.tg_touch_support_ticket_on_user_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'user' THEN
    UPDATE public.support_tickets
    SET status = 'open', updated_at = now()
    WHERE id = NEW.ticket_id
      AND status NOT IN ('closed', 'resolved');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_touch_support_ticket_on_user_message ON public.support_messages;
CREATE TRIGGER tg_touch_support_ticket_on_user_message
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_support_ticket_on_user_message();

CREATE OR REPLACE FUNCTION public.can_read_support_attachment_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_active_admin_session()
    OR split_part(COALESCE(_object_name, ''), '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.support_messages sm
      JOIN public.support_tickets st ON st.id = sm.ticket_id
      WHERE sm.attachment_url = _object_name
        AND st.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_support_attachment_object(text) TO anon, authenticated;

DROP POLICY IF EXISTS "support_attachments_ticket_owner_select" ON storage.objects;
CREATE POLICY "support_attachments_ticket_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND public.can_read_support_attachment_object(name)
);