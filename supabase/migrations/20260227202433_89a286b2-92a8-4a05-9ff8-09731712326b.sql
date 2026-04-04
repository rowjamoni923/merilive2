-- BULK GRANT for all public tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Write permissions for authenticated users on writable tables
DO $$ 
DECLARE
  tbl RECORD;
  write_tables TEXT[] := ARRAY[
    'profiles', 'agencies', 'agency_hosts', 'agency_withdrawals', 
    'agency_earnings_transfers', 'agency_commission_history', 'agency_diamond_transactions',
    'agency_performance', 'sub_agents', 'topup_helpers', 'helper_orders',
    'helper_applications', 'helper_topup_requests', 'helper_transactions',
    'helper_withdrawal_requests', 'helper_upgrade_requests', 'helper_payment_methods',
    'helper_notifications', 'helper_admin_messages', 'helper_message_replies',
    'conversations', 'messages', 'groups', 'group_members', 'group_messages',
    'followers', 'user_reports', 'user_blocks', 'notifications',
    'live_streams', 'private_calls', 'call_events', 'live_face_violations',
    'live_game_bets', 'live_game_rounds',
    'gift_transactions', 'gift_transaction_logs', 'coin_transfers',
    'device_tokens', 'face_records', 'face_verification_submissions',
    'host_applications', 'host_contact_violations',
    'daily_login_claims', 'consumption_return_history',
    'invitation_reward_claims', 'limited_offer_claims', 'first_recharge_claims',
    'user_task_progress', 'user_badges', 'recharge_history',
    'support_tickets', 'support_messages', 'conversation_encryption_keys',
    'chat_moderation_logs',
    'party_rooms', 'party_room_members', 'party_room_messages',
    'party_room_gifts', 'party_room_dj_queue', 'party_room_kicks', 'party_room_games',
    'leaderboard_reward_history',
    'game_sessions', 'game_bets', 'game_transactions', 'game_players', 'game_stats',
    'account_lockouts', 'failed_login_attempts', 'live_bans'
  ];
  tbl_name TEXT;
BEGIN
  FOREACH tbl_name IN ARRAY write_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl_name) THEN
      EXECUTE format('GRANT INSERT, UPDATE ON public.%I TO authenticated', tbl_name);
    END IF;
  END LOOP;
  
  -- DELETE permissions for specific tables
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agency_hosts') THEN
    EXECUTE 'GRANT DELETE ON public.agency_hosts TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'followers') THEN
    EXECUTE 'GRANT DELETE ON public.followers TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_members') THEN
    EXECUTE 'GRANT DELETE ON public.group_members TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'party_room_members') THEN
    EXECUTE 'GRANT DELETE ON public.party_room_members TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'helper_payment_methods') THEN
    EXECUTE 'GRANT DELETE ON public.helper_payment_methods TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_encryption_keys') THEN
    EXECUTE 'GRANT DELETE ON public.conversation_encryption_keys TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'party_room_dj_queue') THEN
    EXECUTE 'GRANT DELETE ON public.party_room_dj_queue TO authenticated';
  END IF;
  
  -- Anon write for presence
  EXECUTE 'GRANT INSERT, UPDATE ON public.profiles TO anon';
  EXECUTE 'GRANT INSERT, UPDATE ON public.device_tokens TO anon';
END $$;