DO $$
DECLARE
  t text;
  drop_list text[] := ARRAY[
    'admin_logs','admin_music_library','admin_notifications','admin_section_permissions','admin_users',
    'agency_commission_history','agency_host_requests','agency_policy_settings','agency_rankings',
    'app_content','app_event_themes','app_icon_registry','app_version_settings','ar_stickers',
    'balance_audit_log','banned_devices','banners','beauty_filters','blocked_ips','blocked_users',
    'branding_settings','categories','channels','chat_bubbles','coin_packages',
    'consumption_return_config','content_audio_tracks','currency_rates','daily_login_claims',
    'daily_login_rewards_config','daily_tasks','device_tokens','diamond_exchange_packages',
    'entertainment','entry_effects','first_recharge_bonus','followers',
    'game_bets','game_configs','game_providers','game_server_settings','game_sessions',
    'game_stats','game_transactions','gift_categories','gifts',
    'helper_applications','helper_assigned_countries','helper_diamond_packages',
    'helper_topup_requests','helper_transactions',
    'host_contact_violations','host_conversion_requests','host_levels',
    'invitation_reward_claims','invitation_settings','kids_content','landing_page_sections',
    'leaderboard_podium_frames','leaderboard_reward_config','leaderboard_reward_history',
    'level_animations','limited_time_offers','live_categories','live_face_violations',
    'live_face_warnings','live_violations','lucky_gift_config','lucky_gift_results',
    'movies','music','new_host_live_bonus_settings','news',
    'notification_preferences','notification_templates','onboarding_slides',
    'parcel_claims','parcel_templates','party_room_backgrounds','party_room_banners',
    'payroll_requests','pk_competition_rewards','pk_competitions','pk_participants',
    'popup_event_banners','rating_reward_claims','reel_comments','reel_likes','reels',
    'role_frames','room_welcome_messages','shop_items','site_settings','stream_recordings',
    'subscription_plans','user_beans_exchange_tiers','user_chat_bubbles','user_entry_effects',
    'user_gift_shop_entitlements','user_levels','user_purchased_backgrounds','user_reports',
    'user_vip_subscriptions','violation_penalties','violation_penalty_tiers',
    'vip_exclusive_items','welcome_bonuses'
  ];
BEGIN
  FOREACH t IN ARRAY drop_list LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;