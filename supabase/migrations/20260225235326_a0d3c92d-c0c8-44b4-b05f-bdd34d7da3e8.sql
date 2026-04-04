-- Grant permissions for moderation and ban tables
GRANT SELECT, INSERT ON public.host_contact_violations TO authenticated;
GRANT SELECT, INSERT ON public.chat_moderation_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.live_bans TO authenticated;

-- Also grant for the RPC function to work properly
GRANT EXECUTE ON FUNCTION public.process_contact_violation TO authenticated;