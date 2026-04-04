-- Essential table-level GRANT permissions for detection system
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
GRANT SELECT, INSERT ON public.chat_moderation_logs TO authenticated;
GRANT SELECT, INSERT ON public.host_contact_violations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.live_bans TO authenticated;