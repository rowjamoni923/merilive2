DROP POLICY IF EXISTS admin_session_can_read_update_log ON public.app_update_check_log;
CREATE POLICY admin_session_can_read_update_log
  ON public.app_update_check_log FOR SELECT
  TO authenticated, anon
  USING (public.is_active_admin_session());