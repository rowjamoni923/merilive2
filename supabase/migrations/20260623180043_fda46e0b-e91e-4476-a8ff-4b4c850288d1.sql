-- Phase 2: close the last two approval-sync gaps
-- 1) admin_broadcast trigger so admin panel + user pages refetch instantly
DROP TRIGGER IF EXISTS tg_admin_broadcast_swift_pay_topups ON public.swift_pay_topups;
CREATE TRIGGER tg_admin_broadcast_swift_pay_topups
AFTER INSERT OR UPDATE OR DELETE ON public.swift_pay_topups
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump();

DROP TRIGGER IF EXISTS tg_admin_broadcast_account_deletion_requests ON public.account_deletion_requests;
CREATE TRIGGER tg_admin_broadcast_account_deletion_requests
AFTER INSERT OR UPDATE OR DELETE ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump();

-- 2) Add to realtime publication so user-side direct subscriptions also work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='swift_pay_topups'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.swift_pay_topups';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='account_deletion_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.account_deletion_requests';
  END IF;
END $$;

-- 3) Ensure REPLICA IDENTITY FULL so UPDATE payloads include old + new rows
ALTER TABLE public.swift_pay_topups REPLICA IDENTITY FULL;
ALTER TABLE public.account_deletion_requests REPLICA IDENTITY FULL;