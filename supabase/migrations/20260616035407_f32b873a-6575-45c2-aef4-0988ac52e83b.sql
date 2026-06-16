
-- Phase 1: Add all admin-managed content tables to supabase_realtime publication
-- and set REPLICA IDENTITY FULL so UPDATE/DELETE events deliver full row payload.
-- Idempotent: uses DO blocks that check existence first.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Visual assets
    'gifts','gift_categories','banners','popup_event_banners','rating_banners',
    'pk_reward_banners','entry_banners','entry_effects','entry_name_bars',
    'vehicle_entrances','chat_bubbles','avatar_frames','role_frames',
    'beauty_filters','ar_stickers','party_room_backgrounds','party_room_banners',
    'onboarding_slides','app_event_themes','app_icon_registry','room_welcome_messages',
    -- Pricing & economy
    'coin_packages','recharge_campaigns','first_recharge_bonus','limited_time_offers',
    'topup_payment_methods','payment_gateways','payment_methods',
    'helper_diamond_packages','diamond_exchange_packages','currency_rates',
    'consumption_return_config','profit_config','shop_items','subscription_plans',
    'noble_cards','parcel_templates',
    -- VIP & levels
    'vip_tiers','vip_medals','vip_perks','vip_exclusive_items',
    'feature_level_requirements','host_levels','helper_level_config',
    'topup_helper_levels','level_privilege_tiers','user_level_thresholds',
    -- Config
    'app_version_settings','app_content','site_content','site_settings',
    'branding_settings','daily_login_rewards_config','daily_tasks',
    'ranking_rewards','leaderboard_reward_config','leaderboard_podium_frames',
    'invitation_settings','invitation_reward_tiers','live_categories',
    'live_moderation_settings','notification_templates','allowed_external_links',
    'categories','channels',
    -- Games & PK
    'game_settings','game_configs','game_providers','game_server_settings',
    'provider_games','pk_battle_assets','pk_competitions','pk_competition_rewards',
    'lucky_gift_config','new_host_live_bonus_settings',
    -- Content
    'landing_page_sections','help_articles','support_categories',
    'iptv_sources','news_sources','youtube_sources','movies','music',
    -- Misc admin-managed
    'agency_faqs','help_articles','admin_music_library','poster_images',
    'live_categories','reel_categories','gift_combo_window','violation_penalty_tiers'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Only operate if table exists in public schema
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      -- Set REPLICA IDENTITY FULL (idempotent — same value is a no-op)
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

      -- Add to publication only if not already a member
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
