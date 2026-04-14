
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'profiles', 'notifications', 'admin_users', 'admin_section_permissions',
    'gift_transactions', 'live_streams', 'agencies', 'helper_orders',
    'coin_transactions', 'app_settings', 'party_rooms', 'reels',
    'private_calls', 'messages', 'chat_rooms', 'agency_withdrawals',
    'host_applications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = tbl)
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
