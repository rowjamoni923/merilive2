-- Pkg362: Zero-refresh push for 7 admin-only tables.
-- Each AFTER trigger fires public.tg_admin_broadcast_bump which honors the
-- existing kill switch + hourly cap + 500ms debounce, so cost is bounded.
-- Adds zero new realtime channels — pages consume via the singleton
-- admin_broadcast bridge already mounted in App.tsx (useAdminBroadcastSync).

DO $$
DECLARE
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'gift_transactions',
    'ranking_rewards',
    'agency_commission_history',
    'admin_pending_actions',
    'support_reports',
    'moderation_audit_log',
    'admin_logs'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS pkg362_admin_broadcast_bump ON public.%I',
      v_tbl
    );
    EXECUTE format(
      'CREATE TRIGGER pkg362_admin_broadcast_bump
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
      v_tbl, v_tbl
    );
  END LOOP;
END $$;