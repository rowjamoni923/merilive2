DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'host_applications',
    'agency_withdrawals',
    'helper_topup_requests',
    'helper_orders',
    'helper_withdrawal_requests',
    'helper_upgrade_requests',
    'payroll_requests',
    'recharge_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- ensure replica identity full so filtered realtime + UPDATE payload works
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    -- add to publication if not already
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;