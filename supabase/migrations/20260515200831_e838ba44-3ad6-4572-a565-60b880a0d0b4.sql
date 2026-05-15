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
  v_admin_id uuid;
  v_message_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_session_required';
  END IF;

  IF _ticket_id IS NULL THEN
    RAISE EXCEPTION 'ticket_required';
  END IF;

  IF _content IS NULL OR length(trim(_content)) = 0 THEN
    RAISE EXCEPTION 'message_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = _ticket_id) THEN
    RAISE EXCEPTION 'ticket_not_found';
  END IF;

  INSERT INTO public.support_messages (
    ticket_id,
    sender_id,
    sender_type,
    content,
    is_read,
    translated_content,
    original_language,
    attachment_url,
    attachment_type,
    support_admin_name
  ) VALUES (
    _ticket_id,
    NULL,
    'admin',
    trim(_content),
    false,
    NULLIF(_translated_content, ''),
    NULLIF(_original_language, ''),
    NULLIF(_attachment_url, ''),
    NULLIF(_attachment_type, ''),
    NULLIF(_support_admin_name, '')
  ) RETURNING id INTO v_message_id;

  IF _mark_pending THEN
    UPDATE public.support_tickets
    SET status = 'pending', updated_at = now()
    WHERE id = _ticket_id;
  END IF;

  RETURN v_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_support_message(uuid, text, text, text, text, text, text, boolean) TO anon, authenticated;