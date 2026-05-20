-- Pkg52: extend admin_broadcast triggers to user-management + financial tables
-- These are all admin-managed; trigger function tg_admin_broadcast_bump throttles 500ms per topic.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'live_bans', 'user_reports', 'blocked_users',
    'host_applications', 'agencies', 'admin_pending_actions',
    'agency_withdrawals', 'helper_withdrawal_requests',
    'payment_transactions', 'recharge_transactions',
    'agency_commission_history', 'agency_earnings_transfers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tg_admin_broadcast_%I ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER tg_admin_broadcast_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
      t, t, t
    );
  END LOOP;
END $$;
