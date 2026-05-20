-- Pkg57: Content/Assets re-audit gap fix
-- Add admin_broadcast trigger for helper_notifications (only table missing in this batch)
DROP TRIGGER IF EXISTS tg_admin_broadcast_helper_notifications ON public.helper_notifications;
CREATE TRIGGER tg_admin_broadcast_helper_notifications
AFTER INSERT OR UPDATE OR DELETE ON public.helper_notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('helper_notifications');