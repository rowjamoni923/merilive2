-- Pkg58: Moderation/Reports re-audit gap fix
DROP TRIGGER IF EXISTS tg_admin_broadcast_admin_permanent_ban_cases ON public.admin_permanent_ban_cases;
CREATE TRIGGER tg_admin_broadcast_admin_permanent_ban_cases
AFTER INSERT OR UPDATE OR DELETE ON public.admin_permanent_ban_cases
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('admin_permanent_ban_cases');

DROP TRIGGER IF EXISTS tg_admin_broadcast_admin_permanent_ban_case_targets ON public.admin_permanent_ban_case_targets;
CREATE TRIGGER tg_admin_broadcast_admin_permanent_ban_case_targets
AFTER INSERT OR UPDATE OR DELETE ON public.admin_permanent_ban_case_targets
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('admin_permanent_ban_case_targets');

DROP TRIGGER IF EXISTS tg_admin_broadcast_blocked_ips ON public.blocked_ips;
CREATE TRIGGER tg_admin_broadcast_blocked_ips
AFTER INSERT OR UPDATE OR DELETE ON public.blocked_ips
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('blocked_ips');