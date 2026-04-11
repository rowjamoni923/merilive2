
-- =============================================
-- ADMIN PANEL A-TO-Z ROOT FIX
-- Fix: "cannot delete/update because it does not have a replica identity"
-- Fix: Missing admin RLS policies causing save failures
-- =============================================

-- 1. Set REPLICA IDENTITY FULL on ALL admin-managed tables
DO $$
DECLARE
  _table text;
  _tables text[] := ARRAY[
    'avatar_frames','banners','entry_banners','entry_name_bars',
    'gifts','gift_categories','coin_packages','currency_rates',
    'daily_login_rewards_config','daily_tasks','consumption_return_config',
    'game_configs','game_providers','game_settings','game_server_settings',
    'categories','channels','ar_stickers','beauty_filters',
    'level_animations','level_privileges','feature_level_requirements',
    'host_levels','user_level_tiers','user_levels','vip_tiers',
    'agency_level_tiers','agency_policy_settings',
    'ranking_rewards','invitation_reward_tiers',
    'parcel_templates','party_room_backgrounds',
    'payment_gateways','topup_payment_methods','subscription_plans',
    'violation_penalties','helper_diamond_packages','helper_level_config',
    'helper_payment_methods','helper_country_payment_methods',
    'leaderboard_reward_config','leaderboard_podium_frames',
    'pk_competition_rewards','limited_time_offers',
    'first_recharge_bonus','new_host_live_bonus_settings',
    'live_moderation_settings','admin_music_library','content_audio_tracks',
    'admin_sections','admin_notices','allowed_external_links',
    'landing_page_sections','site_settings','room_welcome_messages',
    'app_settings','app_version_settings','app_content',
    'app_event_themes','app_icon_registry','branding_settings',
    'notification_templates','coin_transfers',
    'diamond_exchange_packages','pk_reward_badges',
    'entertainment','music','movies','kids_content','news',
    'iptv_sources','news_sources','admin_users',
    'admin_section_permissions','admin_allowed_devices',
    'admin_invitations','admin_logs','admin_stats',
    'admin_notifications','admin_login_otps',
    'agencies','agency_hosts','agency_commission_history',
    'agency_diamond_transactions','agency_earnings_transfers',
    'agency_performance','agency_rankings','agency_withdrawals',
    'profiles','followers','conversations','messages',
    'gift_transactions','gift_transaction_logs',
    'call_events','notifications','live_streams',
    'party_rooms','party_room_participants','party_room_banners',
    'private_calls','stream_chat','stream_viewers',
    'support_tickets','support_messages',
    'blocked_ips','banned_devices','account_lockouts',
    'device_tokens','host_applications','host_conversion_requests',
    'helper_applications','payment_methods','payment_transactions',
    'registration_bonus_claims','daily_login_claims',
    'consumption_return_history','invitation_reward_claims',
    'face_records','face_verification_submissions',
    'rating_reward_claims','chat_moderation_logs',
    'invitation_settings','popup_event_banners'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', _table);
    END IF;
  END LOOP;
END;
$$;

-- 2. Ensure ALL admin tables have RLS enabled + admin policy
DO $$
DECLARE
  _table text;
  _tables text[] := ARRAY[
    'avatar_frames','banners','entry_banners','entry_name_bars',
    'gifts','gift_categories','coin_packages','currency_rates',
    'daily_login_rewards_config','daily_tasks','consumption_return_config',
    'game_configs','game_providers','game_settings','game_server_settings',
    'categories','channels','ar_stickers','beauty_filters',
    'level_animations','level_privileges','feature_level_requirements',
    'host_levels','user_level_tiers','user_levels','vip_tiers',
    'agency_level_tiers','agency_policy_settings',
    'ranking_rewards','invitation_reward_tiers',
    'parcel_templates','party_room_backgrounds',
    'payment_gateways','topup_payment_methods','subscription_plans',
    'violation_penalties','helper_diamond_packages','helper_level_config',
    'helper_payment_methods','helper_country_payment_methods',
    'leaderboard_reward_config','leaderboard_podium_frames',
    'pk_competition_rewards','limited_time_offers',
    'first_recharge_bonus','new_host_live_bonus_settings',
    'live_moderation_settings','admin_music_library','content_audio_tracks',
    'admin_sections','admin_notices','allowed_external_links',
    'landing_page_sections','site_settings','room_welcome_messages',
    'app_settings','app_version_settings','app_content',
    'app_event_themes','app_icon_registry','branding_settings',
    'notification_templates','diamond_exchange_packages',
    'pk_reward_badges','entertainment','music','movies',
    'kids_content','news','iptv_sources','news_sources',
    'admin_users','admin_section_permissions','admin_allowed_devices',
    'admin_invitations','admin_logs','admin_stats',
    'admin_notifications','admin_login_otps',
    'agencies','agency_hosts','agency_commission_history',
    'agency_diamond_transactions','agency_earnings_transfers',
    'agency_performance','agency_rankings','agency_withdrawals',
    'profiles','blocked_ips','banned_devices','account_lockouts',
    'host_applications','host_conversion_requests',
    'helper_applications','payment_methods','payment_transactions',
    'registration_bonus_claims','daily_login_claims',
    'consumption_return_history','invitation_reward_claims',
    'face_records','face_verification_submissions',
    'chat_moderation_logs','invitation_settings',
    'popup_event_banners','party_room_banners',
    'rating_reward_claims','coin_transfers',
    'gift_transactions','gift_transaction_logs',
    'call_events','device_tokens'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
      EXECUTE format('DROP POLICY IF EXISTS admin_full_access ON public.%I', _table);
      EXECUTE format(
        'CREATE POLICY admin_full_access ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))',
        _table
      );
    END IF;
  END LOOP;
END;
$$;

-- 3. Add missing tables to supabase_realtime publication
DO $$
DECLARE
  _table text;
  _rt_tables text[] := ARRAY[
    'avatar_frames','banners','gifts','gift_categories',
    'coin_packages','currency_rates','branding_settings',
    'daily_login_rewards_config','topup_payment_methods',
    'game_configs','game_settings','game_server_settings',
    'ar_stickers','beauty_filters','level_animations',
    'level_privileges','vip_tiers','subscription_plans',
    'limited_time_offers','first_recharge_bonus',
    'admin_music_library','content_audio_tracks',
    'site_settings','room_welcome_messages',
    'diamond_exchange_packages','entertainment',
    'music','movies','kids_content','news',
    'popup_event_banners','violation_penalties',
    'consumption_return_config','daily_tasks',
    'helper_diamond_packages','helper_level_config',
    'helper_payment_methods','helper_country_payment_methods',
    'game_providers','categories','channels',
    'host_levels','user_level_tiers','user_levels',
    'agency_level_tiers','entry_banners','entry_name_bars',
    'coin_transfers','payment_gateways',
    'invitation_settings','parcel_templates',
    'new_host_live_bonus_settings','live_moderation_settings',
    'pk_competition_rewards','pk_reward_badges',
    'admin_notices','notification_templates',
    'party_room_backgrounds','party_room_banners'
  ];
BEGIN
  FOREACH _table IN ARRAY _rt_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = _table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _table);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 4. Ensure public SELECT policies for config tables (app needs to read them)
DO $$
DECLARE
  _table text;
  _public_tables text[] := ARRAY[
    'avatar_frames','banners','entry_banners','entry_name_bars',
    'gifts','gift_categories','coin_packages','currency_rates',
    'daily_login_rewards_config','game_configs','game_settings',
    'categories','channels','ar_stickers','beauty_filters',
    'level_animations','level_privileges','feature_level_requirements',
    'host_levels','user_level_tiers','user_levels','vip_tiers',
    'agency_level_tiers','agency_policy_settings',
    'ranking_rewards','invitation_reward_tiers',
    'party_room_backgrounds','payment_gateways',
    'topup_payment_methods','subscription_plans',
    'violation_penalties','helper_diamond_packages','helper_level_config',
    'helper_payment_methods','helper_country_payment_methods',
    'leaderboard_reward_config','leaderboard_podium_frames',
    'pk_competition_rewards','limited_time_offers',
    'first_recharge_bonus','admin_music_library','content_audio_tracks',
    'admin_notices','allowed_external_links',
    'landing_page_sections','site_settings','room_welcome_messages',
    'app_settings','app_version_settings','app_content',
    'app_event_themes','app_icon_registry','branding_settings',
    'notification_templates','diamond_exchange_packages',
    'pk_reward_badges','entertainment','music','movies',
    'kids_content','news','iptv_sources','news_sources',
    'parcel_templates','popup_event_banners',
    'new_host_live_bonus_settings','live_moderation_settings',
    'party_room_banners','invitation_settings',
    'consumption_return_config','daily_tasks',
    'game_providers','game_server_settings'
  ];
BEGIN
  FOREACH _table IN ARRAY _public_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS public_read ON public.%I', _table);
      EXECUTE format(
        'CREATE POLICY public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        _table
      );
    END IF;
  END LOOP;
END;
$$;
