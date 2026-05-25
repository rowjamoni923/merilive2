REVOKE ALL ON FUNCTION public.is_user_live_banned(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_live_ban(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_live_banned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_live_ban(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_live_banned(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_live_ban(uuid) TO service_role;