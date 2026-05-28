REVOKE ALL ON TABLE public.user_beans_exchanges FROM PUBLIC;
REVOKE ALL ON TABLE public.user_beans_exchanges FROM anon;
REVOKE ALL ON TABLE public.user_beans_exchanges FROM authenticated;
REVOKE ALL ON TABLE public.user_beans_exchanges FROM service_role;

GRANT SELECT ON TABLE public.user_beans_exchanges TO authenticated;
GRANT ALL ON TABLE public.user_beans_exchanges TO service_role;