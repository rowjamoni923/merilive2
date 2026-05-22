DROP TRIGGER IF EXISTS tg_admin_broadcast_topup_helpers ON public.topup_helpers;
CREATE TRIGGER tg_admin_broadcast_topup_helpers
AFTER INSERT OR UPDATE OR DELETE ON public.topup_helpers
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('topup_helpers');