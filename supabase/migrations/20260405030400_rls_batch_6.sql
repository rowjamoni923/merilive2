-- RLS Safe Migration Batch 4

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active gifts" ON public.gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active gifts" ON public.gifts FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active popup banners" ON public.popup_event_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active popup banners" ON public.popup_event_banners FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active topup payment methods" ON public.topup_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active topup payment methods" ON public.topup_payment_methods FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active audio tracks" ON public.content_audio_tracks;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active audio tracks" ON public.content_audio_tracks FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active content" ON public.app_content;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active content" ON public.app_content FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active content" ON public.site_content;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active content" ON public.site_content FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active offers" ON public.limited_time_offers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active offers" ON public.limited_time_offers FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active parcel templates" ON public.parcel_templates;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active parcel templates" ON public.parcel_templates FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active subtitles" ON public.content_subtitles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active subtitles" ON public.content_subtitles FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read app version settings" ON public.app_version_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read app version settings" ON public.app_version_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read bonus settings" ON public.new_host_live_bonus_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read bonus settings" ON public.new_host_live_bonus_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read branding settings" ON public.branding_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read branding settings" ON public.branding_settings FOR SELECT TO anon, authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read consumption return config" ON public.consumption_return_config;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read consumption return config" ON public.consumption_return_config FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read game providers" ON public.game_providers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read game providers" ON public.game_providers FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read host_levels" ON public.host_levels;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read host_levels" ON public.host_levels FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read icons" ON public.app_icon_registry;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read icons" ON public.app_icon_registry FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read notification templates" ON public.notification_templates;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read notification templates" ON public.notification_templates FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read podium frames" ON public.leaderboard_podium_frames;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read podium frames" ON public.leaderboard_podium_frames FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read provider games" ON public.provider_games;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read provider games" ON public.provider_games FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read site_settings" ON public.site_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read site_settings" ON public.site_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read sports" ON public.sports;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read sports" ON public.sports FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read subscription_plans" ON public.subscription_plans;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read subscription_plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read themes" ON public.app_event_themes;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read themes" ON public.app_event_themes FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read youtube_sources" ON public.youtube_sources;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read youtube_sources" ON public.youtube_sources FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK battle gifts" ON public.pk_battle_gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view PK battle gifts" ON public.pk_battle_gifts FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK battles" ON public.pk_battles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view PK battles" ON public.pk_battles FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK competition rewards" ON public.pk_competition_rewards;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view PK competition rewards" ON public.pk_competition_rewards FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK participants" ON public.pk_participants;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view PK participants" ON public.pk_participants FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active PK banners" ON public.pk_reward_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active PK banners" ON public.pk_reward_banners FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active PK competitions" ON public.pk_competitions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active PK competitions" ON public.pk_competitions FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active VIP exclusive items" ON public.vip_exclusive_items;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active VIP exclusive items" ON public.vip_exclusive_items FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active VIP tiers" ON public.vip_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active VIP tiers" ON public.vip_tiers FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active animations" ON public.level_animations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active animations" ON public.level_animations FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active ar stickers" ON public.ar_stickers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active ar stickers" ON public.ar_stickers FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active backgrounds" ON public.party_room_backgrounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active backgrounds" ON public.party_room_backgrounds FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active beauty filters" ON public.beauty_filters;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active beauty filters" ON public.beauty_filters FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active channels" ON public.channels;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active channels" ON public.channels FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active comments" ON public.reel_comments;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active comments" ON public.reel_comments FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active entertainment" ON public.entertainment;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active entertainment" ON public.entertainment FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active entry banners" ON public.entry_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active entry banners" ON public.entry_banners FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active entry name bars" ON public.entry_name_bars;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active entry name bars" ON public.entry_name_bars FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active games" ON public.game_configs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active games" ON public.game_configs FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active games" ON public.game_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active games" ON public.game_settings FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active gifts" ON public.gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active gifts" ON public.gifts FOR SELECT TO authenticated USING (((is_active = true) OR public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active groups" ON public.groups;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active groups" ON public.groups FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active helper payment methods" ON public.helper_country_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active helper payment methods" ON public.helper_country_payment_methods FOR SELECT TO authenticated USING (((is_active = true) OR (helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active helper payment methods legacy" ON public.helper_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active helper payment methods legacy" ON public.helper_payment_methods FOR SELECT TO authenticated USING (((is_active = true) OR (helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active helpers" ON public.topup_helpers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active helpers" ON public.topup_helpers FOR SELECT TO authenticated USING (((is_active = true) AND (is_verified = true)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active invitation settings" ON public.invitation_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active invitation settings" ON public.invitation_settings FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active iptv sources" ON public.iptv_sources;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active iptv sources" ON public.iptv_sources FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active kids content" ON public.kids_content;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active kids content" ON public.kids_content FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active landing sections" ON public.landing_page_sections;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active landing sections" ON public.landing_page_sections FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;
