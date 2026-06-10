GRANT EXECUTE ON FUNCTION public.check_ban_on_login(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_ban_on_login(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_ban_on_login(uuid, text, text) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_calls TO authenticated;
GRANT ALL ON public.private_calls TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topup_helpers TO authenticated;
GRANT ALL ON public.topup_helpers TO service_role;