
-- Fix 1: Drop the redundant recursive policy on admin_users
-- "Owners can manage all admin users" (ALL policy using is_admin) already covers this
DROP POLICY IF EXISTS "Owners can view all admin users select" ON public.admin_users;

-- Fix 2: Replace inline admin_users subquery in popup_event_banners with is_admin()
DROP POLICY IF EXISTS "Admins can manage popup banners" ON public.popup_event_banners;
CREATE POLICY "Admins can manage popup banners" ON public.popup_event_banners
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Fix 3: Replace inline admin_users subqueries in system_error_logs
DROP POLICY IF EXISTS "Admins can delete error logs" ON public.system_error_logs;
CREATE POLICY "Admins can delete error logs" ON public.system_error_logs
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update error logs" ON public.system_error_logs;
CREATE POLICY "Admins can update error logs" ON public.system_error_logs
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));
