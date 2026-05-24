REVOKE EXECUTE ON FUNCTION public.get_conversations_with_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_messages_delivered(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_conversations_with_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_messages_delivered(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversations_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversations_with_details(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(uuid, uuid) TO service_role;