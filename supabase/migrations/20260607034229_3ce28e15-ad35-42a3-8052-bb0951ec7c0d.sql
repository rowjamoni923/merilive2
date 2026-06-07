DROP POLICY IF EXISTS "pkg350_sys_err_auth_insert" ON public.system_error_logs;
DROP POLICY IF EXISTS "Anyone can log errors" ON public.system_error_logs;
DROP POLICY IF EXISTS "Anon can insert error logs" ON public.system_error_logs;
DROP POLICY IF EXISTS "Authenticated users can log errors" ON public.system_error_logs;

CREATE POLICY "system_error_logs_admin_or_authenticated_insert"
ON public.system_error_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  OR public.is_active_admin_session()
);

GRANT INSERT ON public.system_error_logs TO anon, authenticated;
GRANT ALL ON public.system_error_logs TO service_role;