-- Add ALL missing tables to supabase_realtime publication for instant admin→app sync
DO $$
DECLARE
  _tables text[] := ARRAY[
    'conversations','support_tickets','support_messages',
    'live_bans','live_violations','live_face_violations','host_contact_violations',
    'agency_earnings_transfers','agency_commission_history','agency_diamond_transactions','agency_policy_settings',
    'payroll_requests','helper_applications','helper_transactions','helper_topup_requests','helper_withdrawal_requests','helper_message_replies','helper_assigned_countries',
    'host_conversion_requests','host_applications',
    'live_game_rounds','game_sessions','game_bets','game_stats',
    'stream_recordings','user_reports',
    'reel_comments','reel_likes',
    'banned_devices','blocked_ips',
    'invitation_reward_tiers','invitation_reward_claims',
    'user_purchases','user_purchased_backgrounds','user_vip_subscriptions',
    'rating_reward_claims','leaderboard_reward_history',
    'chat_moderation_logs','admin_notifications','admin_logs',
    'pk_battles','pk_battle_gifts','pk_competitions',
    'party_room_participants','party_room_messages',
    'user_level_tiers','vip_exclusive_items',
    'coin_transactions','followers','app_content',
    'welcome_bonuses','daily_login_claims','user_task_progress',
    'parcel_templates','parcel_claims','user_parcels'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;