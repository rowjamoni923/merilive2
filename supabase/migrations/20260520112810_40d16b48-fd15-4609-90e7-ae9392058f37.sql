-- Pkg53: extend admin_broadcast triggers to remaining User Management tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_admin_broadcast_topup_helpers') THEN
    CREATE TRIGGER tg_admin_broadcast_topup_helpers
    AFTER INSERT OR UPDATE OR DELETE ON public.topup_helpers
    FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('topup_helpers');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_admin_broadcast_host_conversion_requests') THEN
    CREATE TRIGGER tg_admin_broadcast_host_conversion_requests
    AFTER INSERT OR UPDATE OR DELETE ON public.host_conversion_requests
    FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('host_conversion_requests');
  END IF;
END $$;