CREATE OR REPLACE FUNCTION public.mark_messages_read(p_message_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;

  IF p_message_ids IS NULL OR array_length(p_message_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE public.messages m
    SET is_read = true
    WHERE m.id = ANY(p_message_ids)
      AND m.sender_id <> v_user
      AND m.is_read = false
      AND public.is_conversation_participant(v_user, m.conversation_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid[]) TO service_role;


CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.is_conversation_participant(v_user, p_conversation_id) THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE public.messages m
    SET is_read = true
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_user
      AND m.is_read = false
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO service_role;