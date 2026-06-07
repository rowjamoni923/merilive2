DROP POLICY IF EXISTS "Admins can update error logs" ON public.system_error_logs;
DROP POLICY IF EXISTS "Admins can delete error logs" ON public.system_error_logs;
DROP POLICY IF EXISTS "pkg350_sys_err_admin_update" ON public.system_error_logs;
DROP POLICY IF EXISTS "pkg350_sys_err_admin_delete" ON public.system_error_logs;

CREATE POLICY "system_error_logs_admin_update"
ON public.system_error_logs
FOR UPDATE
TO anon, authenticated
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

CREATE POLICY "system_error_logs_admin_delete"
ON public.system_error_logs
FOR DELETE
TO anon, authenticated
USING (public.is_active_admin_session());