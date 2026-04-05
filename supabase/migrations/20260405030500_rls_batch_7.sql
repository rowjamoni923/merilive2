-- RLS Safe Migration Batch 5

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active links" ON public.allowed_external_links;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active links" ON public.allowed_external_links FOR SELECT USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active movies" ON public.movies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active movies" ON public.movies FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active music" ON public.music;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active music" ON public.music FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active news" ON public.news;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active news" ON public.news FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active offers" ON public.limited_time_offers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active offers" ON public.limited_time_offers FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active packages" ON public.coin_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active packages" ON public.coin_packages FOR SELECT TO authenticated USING ((public.is_real_user() AND (is_active = true)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active party rooms" ON public.party_rooms;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active party rooms" ON public.party_rooms FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active payment gateways" ON public.payment_gateways;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active payment gateways" ON public.payment_gateways FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active payment methods" ON public.topup_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active payment methods" ON public.topup_payment_methods FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active plans" ON public.subscription_plans;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active policies" ON public.agency_policy_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active policies" ON public.agency_policy_settings FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active popup banners" ON public.popup_event_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active popup banners" ON public.popup_event_banners FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active privileges" ON public.level_privileges;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active privileges" ON public.level_privileges FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active reel categories" ON public.reel_categories;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active reel categories" ON public.reel_categories FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active sports" ON public.sports;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active sports" ON public.sports FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active streams" ON public.live_streams;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active streams" ON public.live_streams FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active tasks" ON public.daily_tasks;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active tasks" ON public.daily_tasks FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active welcome messages" ON public.room_welcome_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active welcome messages" ON public.room_welcome_messages FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view admin music" ON public.admin_music_library;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view admin music" ON public.admin_music_library FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view agency level tiers" ON public.agency_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view agency level tiers" ON public.agency_level_tiers FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view approved active reels" ON public.reels;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view approved active reels" ON public.reels FOR SELECT TO authenticated USING (((is_active = true) AND (is_approved = true)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view branding settings" ON public.branding_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view branding settings" ON public.branding_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view currency rates" ON public.currency_rates;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view currency rates" ON public.currency_rates FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view feature requirements" ON public.feature_level_requirements;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view feature requirements" ON public.feature_level_requirements FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view first recharge config" ON public.first_recharge_bonus;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view first recharge config" ON public.first_recharge_bonus FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view followers" ON public.followers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view followers" ON public.followers FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view frames" ON public.avatar_frames;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view frames" ON public.avatar_frames FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view game players" ON public.game_players;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view game players" ON public.game_players FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view game sessions" ON public.game_sessions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view game sessions" ON public.game_sessions FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view game stats" ON public.game_stats;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view game stats" ON public.game_stats FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view gift categories" ON public.gift_categories;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view gift categories" ON public.gift_categories FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view helper diamond packages" ON public.helper_diamond_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view helper diamond packages" ON public.helper_diamond_packages FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view level config" ON public.helper_level_config;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view level config" ON public.helper_level_config FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view level tiers" ON public.user_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view level tiers" ON public.user_level_tiers FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view live game rounds" ON public.live_game_rounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view live game rounds" ON public.live_game_rounds FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view login rewards config" ON public.daily_login_rewards_config;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view login rewards config" ON public.daily_login_rewards_config FOR SELECT USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view moderation settings" ON public.live_moderation_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view moderation settings" ON public.live_moderation_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view penalty tiers" ON public.violation_penalty_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view penalty tiers" ON public.violation_penalty_tiers FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view performance" ON public.agency_performance;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view performance" ON public.agency_performance FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view rankings" ON public.agency_rankings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view rankings" ON public.agency_rankings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view reel likes" ON public.reel_likes;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view reel likes" ON public.reel_likes FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view reward config" ON public.leaderboard_reward_config;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view reward config" ON public.leaderboard_reward_config FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view rewards config" ON public.ranking_rewards;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view rewards config" ON public.ranking_rewards FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view room participants" ON public.party_room_participants;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view room participants" ON public.party_room_participants FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view roulette sessions" ON public.roulette_sessions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view roulette sessions" ON public.roulette_sessions FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view seat requests in their room" ON public.seat_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view seat requests in their room" ON public.seat_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.party_room_participants WHERE ((party_room_participants.room_id = seat_requests.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shares" ON public.reel_shares;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view shares" ON public.reel_shares FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shop items" ON public.shop_items;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view shop items" ON public.shop_items FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shop items public" ON public.shop_items;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view shop items public" ON public.shop_items FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view site settings" ON public.site_settings FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view stream chat" ON public.stream_chat;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view stream chat" ON public.stream_chat FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view stream viewers" ON public.stream_viewers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view stream viewers" ON public.stream_viewers FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view verified invitations for leaderboard" ON public.user_invitations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view verified invitations for leaderboard" ON public.user_invitations FOR SELECT TO authenticated USING ((status = ''verified''::text));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated admins can view all applications" ON public.host_applications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated admins can view all applications" ON public.host_applications FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can check lockout status" ON public.account_lockouts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can check lockout status" ON public.account_lockouts FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;
