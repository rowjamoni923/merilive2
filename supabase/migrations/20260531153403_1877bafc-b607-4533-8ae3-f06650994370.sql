DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'agency_performance',
    'agency_hosts',
    'agency_diamond_transactions',
    'agency_earnings_transfers',
    'agency_commission_history',
    'app_settings',
    'coin_transactions',
    'daily_login_claims',
    'helper_notifications',
    'live_bans',
    'live_game_bets',
    'live_game_rounds',
    'rating_reward_claims',
    'user_task_progress',
    'user_vip_subscriptions',
    'user_parcels',
    'payment_transactions',
    'game_transactions',
    'level_animations',
    'level_privileges',
    'user_level_tiers',
    'trader_level_tiers',
    'helper_country_payment_methods',
    'pk_battles',
    'pk_battle_gifts',
    'pk_participants',
    'groups',
    'group_members'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = tbl
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;