-- ============================================================
-- Pkg327 final: section-permission gates for support admin access
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_admin_has_section_access(_section_key text, _require_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.id = public.current_admin_id_from_header()
      AND au.is_active = true
      AND au.role = 'owner'
  )
  OR EXISTS (
    SELECT 1
    FROM public.admin_users au
    JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
    JOIN public.admin_sections s ON s.id = asp.section_id
    WHERE au.id = public.current_admin_id_from_header()
      AND au.is_active = true
      AND s.is_active = true
      AND (s.section_key = _section_key OR s.hub_key = _section_key)
      AND asp.can_view = true
      AND (_require_edit IS NOT TRUE OR asp.can_edit = true)
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_admin_has_section_access(text, boolean) TO anon, authenticated;

-- Replace broad “any admin session” support table policies with section-aware policies.
DROP POLICY IF EXISTS "Admin session full access" ON public.support_tickets;
DROP POLICY IF EXISTS "Support admins can read tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Support admins can create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Support admins can update tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Support admins can delete tickets" ON public.support_tickets;
CREATE POLICY "Support admins can read tickets"
ON public.support_tickets
FOR SELECT
TO anon, authenticated
USING (public.current_admin_has_section_access('moderation-hub', false));
CREATE POLICY "Support admins can create tickets"
ON public.support_tickets
FOR INSERT
TO anon, authenticated
WITH CHECK (public.current_admin_has_section_access('moderation-hub', true));
CREATE POLICY "Support admins can update tickets"
ON public.support_tickets
FOR UPDATE
TO anon, authenticated
USING (public.current_admin_has_section_access('moderation-hub', true))
WITH CHECK (public.current_admin_has_section_access('moderation-hub', true));
CREATE POLICY "Support admins can delete tickets"
ON public.support_tickets
FOR DELETE
TO anon, authenticated
USING (public.current_admin_has_section_access('moderation-hub', true));

DROP POLICY IF EXISTS "Admin session full access" ON public.support_messages;
DROP POLICY IF EXISTS "Support admins can read messages" ON public.support_messages;
DROP POLICY IF EXISTS "Support admins can create messages" ON public.support_messages;
DROP POLICY IF EXISTS "Support admins can update messages" ON public.support_messages;
DROP POLICY IF EXISTS "Support admins can delete messages" ON public.support_messages;
CREATE POLICY "Support admins can read messages"
ON public.support_messages
FOR SELECT
TO anon, authenticated
USING (public.current_admin_has_section_access('moderation-hub', false));
CREATE POLICY "Support admins can create messages"
ON public.support_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (public.current_admin_has_section_access('moderation-hub', true));
CREATE POLICY "Support admins can update messages"
ON public.support_messages
FOR UPDATE
TO anon, authenticated
USING (public.current_admin_has_section_access('moderation-hub', true))
WITH CHECK (public.current_admin_has_section_access('moderation-hub', true));
CREATE POLICY "Support admins can delete messages"
ON public.support_messages
FOR DELETE
TO anon, authenticated
USING (public.current_admin_has_section_access('moderation-hub', true));

-- Storage: keep private support attachments, but make admin access section-aware.
DROP POLICY IF EXISTS "support_attachments_admin_session_full_access" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_admin_delete" ON storage.objects;
CREATE POLICY "support_attachments_admin_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'support-attachments' AND public.current_admin_has_section_access('moderation-hub', false));
CREATE POLICY "support_attachments_admin_insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'support-attachments' AND public.current_admin_has_section_access('moderation-hub', true));
CREATE POLICY "support_attachments_admin_update"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'support-attachments' AND public.current_admin_has_section_access('moderation-hub', true))
WITH CHECK (bucket_id = 'support-attachments' AND public.current_admin_has_section_access('moderation-hub', true));
CREATE POLICY "support_attachments_admin_delete"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'support-attachments' AND public.current_admin_has_section_access('moderation-hub', true));

-- RPC hardening: any active admin is no longer enough for support mutations.
CREATE OR REPLACE FUNCTION public.admin_send_support_message(
  _ticket_id uuid,
  _content text,
  _translated_content text DEFAULT NULL,
  _original_language text DEFAULT NULL,
  _attachment_url text DEFAULT NULL,
  _attachment_type text DEFAULT NULL,
  _support_admin_name text DEFAULT NULL,
  _mark_pending boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_message_id uuid;
BEGIN
  IF NOT public.current_admin_has_section_access('moderation-hub', true) THEN
    RAISE EXCEPTION 'support_edit_permission_required' USING ERRCODE = '42501';
  END IF;

  IF _ticket_id IS NULL THEN RAISE EXCEPTION 'ticket_required'; END IF;
  IF _content IS NULL OR length(trim(_content)) = 0 THEN RAISE EXCEPTION 'message_required'; END IF;
  IF length(trim(_content)) > 5000 THEN RAISE EXCEPTION 'message_too_long'; END IF;
  IF _attachment_url IS NOT NULL AND trim(_attachment_url) <> '' AND trim(_attachment_url) ~* '^https?://' THEN
    RAISE EXCEPTION 'support_attachment_must_be_storage_path' USING ERRCODE = '42501';
  END IF;
  IF _attachment_type IS NOT NULL AND trim(_attachment_type) <> '' AND _attachment_type NOT IN ('image','voice') THEN
    RAISE EXCEPTION 'invalid_attachment_type';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = _ticket_id) THEN
    RAISE EXCEPTION 'ticket_not_found';
  END IF;

  INSERT INTO public.support_messages (
    ticket_id, sender_id, sender_type, content, is_read,
    translated_content, original_language, attachment_url, attachment_type, support_admin_name
  ) VALUES (
    _ticket_id, NULL, 'admin', trim(_content), false,
    NULLIF(_translated_content, ''), NULLIF(_original_language, ''),
    NULLIF(trim(COALESCE(_attachment_url, '')), ''), NULLIF(_attachment_type, ''), NULLIF(_support_admin_name, '')
  ) RETURNING id INTO v_message_id;

  IF _mark_pending THEN
    UPDATE public.support_tickets
    SET status = 'pending', updated_at = now()
    WHERE id = _ticket_id;
  END IF;

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.support_admin_file_report(
  _ticket_id uuid, _message_id uuid, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_admin_name text;
  v_user_id uuid;
  v_user_uid text;
  v_subject text;
  v_msg text := '';
  v_report_id uuid;
BEGIN
  IF NOT public.current_admin_has_section_access('moderation-hub', true) THEN
    RAISE EXCEPTION 'support_edit_permission_required' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF length(trim(_reason)) > 1000 THEN RAISE EXCEPTION 'reason_too_long'; END IF;

  SELECT COALESCE(NULLIF(trim(support_display_name), ''), display_name, email)
    INTO v_admin_name
  FROM public.admin_users WHERE id = v_admin_id;

  SELECT user_id, subject INTO v_user_id, v_subject
  FROM public.support_tickets WHERE id = _ticket_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;

  SELECT app_uid INTO v_user_uid FROM public.profiles WHERE id = v_user_id;

  IF _message_id IS NOT NULL THEN
    SELECT content INTO v_msg FROM public.support_messages
    WHERE id = _message_id AND ticket_id = _ticket_id;
  END IF;

  INSERT INTO public.support_reports(
    ticket_id, message_id, user_id, user_app_uid,
    ticket_subject, message_content, reason,
    reported_by_admin_id, reported_by_admin_name
  ) VALUES (
    _ticket_id, _message_id, v_user_id, v_user_uid,
    v_subject, COALESCE(v_msg, ''), trim(_reason),
    v_admin_id, v_admin_name
  ) RETURNING id INTO v_report_id;

  INSERT INTO public.notifications(user_id, title, message, type, data)
  SELECT au.user_id,
         '🚨 Support Report',
         COALESCE(v_admin_name, 'Support admin') || ' reported a support issue',
         'admin_support_report',
         jsonb_build_object('report_id', v_report_id, 'ticket_id', _ticket_id, 'user_id', v_user_id, 'user_app_uid', v_user_uid)
  FROM public.admin_users au
  WHERE au.role = 'owner' AND au.is_active = true AND au.user_id IS NOT NULL;

  RETURN v_report_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_my_support_display_name(_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_clean text := NULLIF(trim(COALESCE(_name, '')), '');
BEGIN
  IF NOT public.current_admin_has_section_access('moderation-hub', true) THEN
    RAISE EXCEPTION 'support_edit_permission_required' USING ERRCODE = '42501';
  END IF;
  IF v_clean IS NOT NULL AND length(v_clean) > 60 THEN RAISE EXCEPTION 'name_too_long'; END IF;
  UPDATE public.admin_users SET support_display_name = v_clean WHERE id = v_admin_id;
  RETURN v_clean;
END; $$;