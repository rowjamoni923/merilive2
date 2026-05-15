
-- Re-create the helper for this migration (was dropped at end of Pkg36)
CREATE OR REPLACE FUNCTION public.__attach_admin_broadcast(_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_trigger text := 'tg_admin_broadcast_' || _table;
BEGIN
  -- Skip silently if table doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=_table) THEN
    RETURN;
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_trigger, _table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
    v_trigger, _table, _table
  );
END;
$$;

-- Attach broadcast triggers to all admin-config / catalog tables.
-- (47 from Pkg36 + ~63 new ones)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Pkg36 set (idempotent re-attach)
    'banners','popup_event_banners','rating_banners','onboarding_slides','app_content','landing_page_sections',
    'gifts','avatar_frames','role_frames','chat_bubbles','entry_effects','entry_banners','beauty_filters','ar_stickers',
    'coin_packages','currency_rates','topup_payment_methods','branding_settings','app_settings','app_version_settings',
    'vip_tiers','level_privileges','level_animations','user_level_tiers','feature_level_requirements',
    'game_settings','game_providers','game_server_settings',
    'daily_tasks','ranking_rewards','daily_login_rewards_config','first_recharge_bonus','consumption_return_config',
    'limited_time_offers','new_host_live_bonus_settings',
    'leaderboard_reward_config','leaderboard_podium_frames',
    'parcel_templates','helper_level_config','user_beans_exchange_tiers','agency_level_tiers',
    'invitation_settings','invitation_reward_tiers','allowed_external_links',
    'violation_penalty_tiers','notification_templates','admin_notices','shop_items',
    -- New in Pkg37
    'noble_cards','noble_tiers','vip_medals','vip_perks','vip_exclusive_items','premium_animations_hidden','subscription_plans',
    'gift_categories','lucky_gift_config','diamond_exchange_packages','helper_diamond_packages',
    'party_room_backgrounds','party_room_banners','room_welcome_messages','vehicle_entrances','entry_name_bars','live_moderation_settings',
    'game_configs','provider_games',
    'pk_reward_banners','pk_competitions',
    'helper_payment_methods','helper_country_payment_methods','helper_accepted_payment_methods','helper_assigned_countries',
    'topup_helper_levels','trader_level_tiers','agency_faqs','agency_policy_settings',
    'payment_gateways','payment_methods','recharge_campaigns',
    'support_categories','help_articles',
    'site_content','site_settings','app_event_themes','admin_music_library','app_icon_registry',
    'host_levels','user_level_thresholds',
    'iptv_sources','news_sources','youtube_sources','reel_categories',
    'categories','channels','sports','movies','news','entertainment','kids_content','music','poster_images','watchlist'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM public.__attach_admin_broadcast(t);
  END LOOP;
END $$;

-- Seed broadcast rows for new topics
INSERT INTO public.admin_broadcast (topic, version)
SELECT unnest(ARRAY[
  'noble_cards','noble_tiers','vip_medals','vip_perks','vip_exclusive_items','premium_animations_hidden','subscription_plans',
  'gift_categories','lucky_gift_config','diamond_exchange_packages','helper_diamond_packages',
  'party_room_backgrounds','party_room_banners','room_welcome_messages','vehicle_entrances','entry_name_bars','live_moderation_settings',
  'game_configs','provider_games',
  'pk_reward_banners','pk_competitions',
  'helper_payment_methods','helper_country_payment_methods','helper_accepted_payment_methods','helper_assigned_countries',
  'topup_helper_levels','trader_level_tiers','agency_faqs','agency_policy_settings',
  'payment_gateways','payment_methods','recharge_campaigns',
  'support_categories','help_articles',
  'site_content','site_settings','app_event_themes','admin_music_library','app_icon_registry',
  'host_levels','user_level_thresholds',
  'iptv_sources','news_sources','youtube_sources','reel_categories',
  'categories','channels','sports','movies','news','entertainment','kids_content','music','poster_images','watchlist'
]), 0
ON CONFLICT (topic) DO NOTHING;

DROP FUNCTION IF EXISTS public.__attach_admin_broadcast(text);
