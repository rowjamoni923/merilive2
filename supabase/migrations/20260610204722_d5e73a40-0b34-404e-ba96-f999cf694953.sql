GRANT EXECUTE ON FUNCTION public.is_real_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_dm_blocked(uuid, uuid) TO authenticated, service_role;