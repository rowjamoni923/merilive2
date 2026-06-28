-- Allow active admin sessions to UPDATE notifications (mark read / clear).
-- Without this, admin "Mark all as read" / per-row read updates silently fail
-- under RLS (auth.uid() is null for the admin client), so cleared notifications
-- come back after a refresh.
DROP POLICY IF EXISTS pkg349_notifications_admin_update ON public.notifications;
CREATE POLICY pkg349_notifications_admin_update
  ON public.notifications
  FOR UPDATE
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

DROP POLICY IF EXISTS pkg349_notifications_admin_delete ON public.notifications;
CREATE POLICY pkg349_notifications_admin_delete
  ON public.notifications
  FOR DELETE
  USING (public.is_active_admin_session());