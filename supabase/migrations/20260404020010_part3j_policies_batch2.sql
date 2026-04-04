DROP POLICY IF EXISTS "Anyone can read app version settings" ON public.app_version_settings;
CREATE POLICY "Anyone can read app version settings" ON public.app_version_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read bonus settings" ON public.new_host_live_bonus_settings;
CREATE POLICY "Anyone can read bonus settings" ON public.new_host_live_bonus_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read branding settings" ON public.branding_settings;
CREATE POLICY "Anyone can read branding settings" ON public.branding_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read consumption return config" ON public.consumption_return_config;
CREATE POLICY "Anyone can read consumption return config" ON public.consumption_return_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can read game providers" ON public.game_providers;
CREATE POLICY "Anyone can read game providers" ON public.game_providers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read host_levels" ON public.host_levels;
CREATE POLICY "Anyone can read host_levels" ON public.host_levels FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read icons" ON public.app_icon_registry;
CREATE POLICY "Anyone can read icons" ON public.app_icon_registry FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can read notification templates" ON public.notification_templates;
CREATE POLICY "Anyone can read notification templates" ON public.notification_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read podium frames" ON public.leaderboard_podium_frames;
CREATE POLICY "Anyone can read podium frames" ON public.leaderboard_podium_frames FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read provider games" ON public.provider_games;
CREATE POLICY "Anyone can read provider games" ON public.provider_games FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read site_settings" ON public.site_settings;
CREATE POLICY "Anyone can read site_settings" ON public.site_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read sports" ON public.sports;
CREATE POLICY "Anyone can read sports" ON public.sports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read subscription_plans" ON public.subscription_plans;
CREATE POLICY "Anyone can read subscription_plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read themes" ON public.app_event_themes;
CREATE POLICY "Anyone can read themes" ON public.app_event_themes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can read youtube_sources" ON public.youtube_sources;
CREATE POLICY "Anyone can read youtube_sources" ON public.youtube_sources FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view PK battle gifts" ON public.pk_battle_gifts;
CREATE POLICY "Anyone can view PK battle gifts" ON public.pk_battle_gifts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view PK battles" ON public.pk_battles;
CREATE POLICY "Anyone can view PK battles" ON public.pk_battles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view PK competition rewards" ON public.pk_competition_rewards;
CREATE POLICY "Anyone can view PK competition rewards" ON public.pk_competition_rewards FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view PK participants" ON public.pk_participants;
CREATE POLICY "Anyone can view PK participants" ON public.pk_participants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active PK banners" ON public.pk_reward_banners;
CREATE POLICY "Anyone can view active PK banners" ON public.pk_reward_banners FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active PK competitions" ON public.pk_competitions;
CREATE POLICY "Anyone can view active PK competitions" ON public.pk_competitions FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active VIP exclusive items" ON public.vip_exclusive_items;
CREATE POLICY "Anyone can view active VIP exclusive items" ON public.vip_exclusive_items FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active VIP tiers" ON public.vip_tiers;
CREATE POLICY "Anyone can view active VIP tiers" ON public.vip_tiers FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active animations" ON public.level_animations;
CREATE POLICY "Anyone can view active animations" ON public.level_animations FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active ar stickers" ON public.ar_stickers;
CREATE POLICY "Anyone can view active ar stickers" ON public.ar_stickers FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active backgrounds" ON public.party_room_backgrounds;
CREATE POLICY "Anyone can view active backgrounds" ON public.party_room_backgrounds FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banners;
CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active beauty filters" ON public.beauty_filters;
CREATE POLICY "Anyone can view active beauty filters" ON public.beauty_filters FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active channels" ON public.channels;
CREATE POLICY "Anyone can view active channels" ON public.channels FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active comments" ON public.reel_comments;
CREATE POLICY "Anyone can view active comments" ON public.reel_comments FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active entertainment" ON public.entertainment;
CREATE POLICY "Anyone can view active entertainment" ON public.entertainment FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active entry banners" ON public.entry_banners;
CREATE POLICY "Anyone can view active entry banners" ON public.entry_banners FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active entry name bars" ON public.entry_name_bars;
CREATE POLICY "Anyone can view active entry name bars" ON public.entry_name_bars FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active games" ON public.game_configs;
CREATE POLICY "Anyone can view active games" ON public.game_configs FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active games" ON public.game_settings;
CREATE POLICY "Anyone can view active games" ON public.game_settings FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active gifts" ON public.gifts;
CREATE POLICY "Anyone can view active gifts" ON public.gifts FOR SELECT TO authenticated USING (((is_active = true) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Anyone can view active groups" ON public.groups;
CREATE POLICY "Anyone can view active groups" ON public.groups FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active helper payment methods" ON public.helper_country_payment_methods;
CREATE POLICY "Anyone can view active helper payment methods" ON public.helper_country_payment_methods FOR SELECT TO authenticated USING (((is_active = true) OR (helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Anyone can view active helper payment methods legacy" ON public.helper_payment_methods;
CREATE POLICY "Anyone can view active helper payment methods legacy" ON public.helper_payment_methods FOR SELECT TO authenticated USING (((is_active = true) OR (helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Anyone can view active helpers" ON public.topup_helpers;
CREATE POLICY "Anyone can view active helpers" ON public.topup_helpers FOR SELECT TO authenticated USING (((is_active = true) AND (is_verified = true)));

DROP POLICY IF EXISTS "Anyone can view active invitation settings" ON public.invitation_settings;
CREATE POLICY "Anyone can view active invitation settings" ON public.invitation_settings FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active iptv sources" ON public.iptv_sources;
CREATE POLICY "Anyone can view active iptv sources" ON public.iptv_sources FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active kids content" ON public.kids_content;
CREATE POLICY "Anyone can view active kids content" ON public.kids_content FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active landing sections" ON public.landing_page_sections;
CREATE POLICY "Anyone can view active landing sections" ON public.landing_page_sections FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active links" ON public.allowed_external_links;
CREATE POLICY "Anyone can view active links" ON public.allowed_external_links FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active movies" ON public.movies;
CREATE POLICY "Anyone can view active movies" ON public.movies FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active music" ON public.music;
CREATE POLICY "Anyone can view active music" ON public.music FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active news" ON public.news;
CREATE POLICY "Anyone can view active news" ON public.news FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active offers" ON public.limited_time_offers;
CREATE POLICY "Anyone can view active offers" ON public.limited_time_offers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view active packages" ON public.coin_packages;
CREATE POLICY "Anyone can view active packages" ON public.coin_packages FOR SELECT TO authenticated USING ((public.is_real_user() AND (is_active = true)));

DROP POLICY IF EXISTS "Anyone can view active party rooms" ON public.party_rooms;
CREATE POLICY "Anyone can view active party rooms" ON public.party_rooms FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active payment gateways" ON public.payment_gateways;
CREATE POLICY "Anyone can view active payment gateways" ON public.payment_gateways FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active payment methods" ON public.topup_payment_methods;
CREATE POLICY "Anyone can view active payment methods" ON public.topup_payment_methods FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active plans" ON public.subscription_plans;
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active policies" ON public.agency_policy_settings;
CREATE POLICY "Anyone can view active policies" ON public.agency_policy_settings FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active popup banners" ON public.popup_event_banners;
CREATE POLICY "Anyone can view active popup banners" ON public.popup_event_banners FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active privileges" ON public.level_privileges;
CREATE POLICY "Anyone can view active privileges" ON public.level_privileges FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active reel categories" ON public.reel_categories;
CREATE POLICY "Anyone can view active reel categories" ON public.reel_categories FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active sports" ON public.sports;
CREATE POLICY "Anyone can view active sports" ON public.sports FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active streams" ON public.live_streams;
CREATE POLICY "Anyone can view active streams" ON public.live_streams FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active tasks" ON public.daily_tasks;
CREATE POLICY "Anyone can view active tasks" ON public.daily_tasks FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active welcome messages" ON public.room_welcome_messages;
CREATE POLICY "Anyone can view active welcome messages" ON public.room_welcome_messages FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view admin music" ON public.admin_music_library;
CREATE POLICY "Anyone can view admin music" ON public.admin_music_library FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Anyone can view agency level tiers" ON public.agency_level_tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view approved active reels" ON public.reels;
CREATE POLICY "Anyone can view approved active reels" ON public.reels FOR SELECT TO authenticated USING (((is_active = true) AND (is_approved = true)));

DROP POLICY IF EXISTS "Anyone can view branding settings" ON public.branding_settings;
CREATE POLICY "Anyone can view branding settings" ON public.branding_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view currency rates" ON public.currency_rates;
CREATE POLICY "Anyone can view currency rates" ON public.currency_rates FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view feature requirements" ON public.feature_level_requirements;
CREATE POLICY "Anyone can view feature requirements" ON public.feature_level_requirements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view first recharge config" ON public.first_recharge_bonus;
CREATE POLICY "Anyone can view first recharge config" ON public.first_recharge_bonus FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view followers" ON public.followers;
CREATE POLICY "Anyone can view followers" ON public.followers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view frames" ON public.avatar_frames;
CREATE POLICY "Anyone can view frames" ON public.avatar_frames FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view game players" ON public.game_players;
CREATE POLICY "Anyone can view game players" ON public.game_players FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view game sessions" ON public.game_sessions;
CREATE POLICY "Anyone can view game sessions" ON public.game_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view game stats" ON public.game_stats;
CREATE POLICY "Anyone can view game stats" ON public.game_stats FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view gift categories" ON public.gift_categories;
CREATE POLICY "Anyone can view gift categories" ON public.gift_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view helper diamond packages" ON public.helper_diamond_packages;
CREATE POLICY "Anyone can view helper diamond packages" ON public.helper_diamond_packages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view level config" ON public.helper_level_config;
CREATE POLICY "Anyone can view level config" ON public.helper_level_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view level tiers" ON public.user_level_tiers;
CREATE POLICY "Anyone can view level tiers" ON public.user_level_tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view live game rounds" ON public.live_game_rounds;
CREATE POLICY "Anyone can view live game rounds" ON public.live_game_rounds FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view login rewards config" ON public.daily_login_rewards_config;
CREATE POLICY "Anyone can view login rewards config" ON public.daily_login_rewards_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view moderation settings" ON public.live_moderation_settings;
CREATE POLICY "Anyone can view moderation settings" ON public.live_moderation_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view penalty tiers" ON public.violation_penalty_tiers;
CREATE POLICY "Anyone can view penalty tiers" ON public.violation_penalty_tiers FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view performance" ON public.agency_performance;
CREATE POLICY "Anyone can view performance" ON public.agency_performance FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view rankings" ON public.agency_rankings;
CREATE POLICY "Anyone can view rankings" ON public.agency_rankings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view reel likes" ON public.reel_likes;
CREATE POLICY "Anyone can view reel likes" ON public.reel_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view reward config" ON public.leaderboard_reward_config;
CREATE POLICY "Anyone can view reward config" ON public.leaderboard_reward_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view rewards config" ON public.ranking_rewards;
CREATE POLICY "Anyone can view rewards config" ON public.ranking_rewards FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view room participants" ON public.party_room_participants;
CREATE POLICY "Anyone can view room participants" ON public.party_room_participants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view roulette sessions" ON public.roulette_sessions;
CREATE POLICY "Anyone can view roulette sessions" ON public.roulette_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view seat requests in their room" ON public.seat_requests;
CREATE POLICY "Anyone can view seat requests in their room" ON public.seat_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.party_room_participants
  WHERE ((party_room_participants.room_id = seat_requests.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))));

DROP POLICY IF EXISTS "Anyone can view shares" ON public.reel_shares;
CREATE POLICY "Anyone can view shares" ON public.reel_shares FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view shop items" ON public.shop_items;
CREATE POLICY "Anyone can view shop items" ON public.shop_items FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view shop items public" ON public.shop_items;
CREATE POLICY "Anyone can view shop items public" ON public.shop_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
CREATE POLICY "Anyone can view site settings" ON public.site_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view stream chat" ON public.stream_chat;
CREATE POLICY "Anyone can view stream chat" ON public.stream_chat FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view stream viewers" ON public.stream_viewers;
CREATE POLICY "Anyone can view stream viewers" ON public.stream_viewers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view verified invitations for leaderboard" ON public.user_invitations;
CREATE POLICY "Anyone can view verified invitations for leaderboard" ON public.user_invitations FOR SELECT TO authenticated USING ((status = 'verified'::text));

DROP POLICY IF EXISTS "Authenticated admins can view all applications" ON public.host_applications;
CREATE POLICY "Authenticated admins can view all applications" ON public.host_applications FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can check lockout status" ON public.account_lockouts;
CREATE POLICY "Authenticated can check lockout status" ON public.account_lockouts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert own violations" ON public.host_contact_violations;
CREATE POLICY "Authenticated can insert own violations" ON public.host_contact_violations FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Authenticated can read allowed links" ON public.allowed_external_links;
CREATE POLICY "Authenticated can read allowed links" ON public.allowed_external_links FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can view all banners" ON public.party_room_banners;
CREATE POLICY "Authenticated can view all banners" ON public.party_room_banners FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can view all bets" ON public.game_bets;
CREATE POLICY "Authenticated can view all bets" ON public.game_bets FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated can view all games" ON public.game_settings;
CREATE POLICY "Authenticated can view all games" ON public.game_settings FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated can view errors" ON public.system_error_logs;
CREATE POLICY "Authenticated can view errors" ON public.system_error_logs FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated can view game stats" ON public.game_stats;
CREATE POLICY "Authenticated can view game stats" ON public.game_stats FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated can view non-blocked profiles" ON public.profiles;
CREATE POLICY "Authenticated can view non-blocked profiles" ON public.profiles FOR SELECT USING (((auth.uid() IS NOT NULL) AND (is_blocked = false)));

DROP POLICY IF EXISTS "Authenticated can view own violations" ON public.host_contact_violations;
CREATE POLICY "Authenticated can view own violations" ON public.host_contact_violations FOR SELECT TO authenticated USING (((auth.uid() = host_id) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can chat" ON public.stream_chat;
CREATE POLICY "Authenticated users can chat" ON public.stream_chat FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));

DROP POLICY IF EXISTS "Authenticated users can comment" ON public.reel_comments;
CREATE POLICY "Authenticated users can comment" ON public.reel_comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Authenticated users can create PK battles" ON public.pk_battles;
CREATE POLICY "Authenticated users can create PK battles" ON public.pk_battles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = challenger_id));

DROP POLICY IF EXISTS "Authenticated users can create alerts" ON public.security_alerts;
CREATE POLICY "Authenticated users can create alerts" ON public.security_alerts FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON public.game_sessions;
CREATE POLICY "Authenticated users can create game sessions" ON public.game_sessions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.party_rooms
  WHERE ((party_rooms.id = game_sessions.room_id) AND (party_rooms.host_id = auth.uid())))));

DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));

DROP POLICY IF EXISTS "Authenticated users can create party rooms" ON public.party_rooms;
CREATE POLICY "Authenticated users can create party rooms" ON public.party_rooms FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Authenticated users can insert moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Authenticated users can insert moderation logs" ON public.chat_moderation_logs FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can like reels" ON public.reel_likes;
CREATE POLICY "Authenticated users can like reels" ON public.reel_likes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Authenticated users can log attempts" ON public.login_attempts;
CREATE POLICY "Authenticated users can log attempts" ON public.login_attempts FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated users can log errors" ON public.system_error_logs;
CREATE POLICY "Authenticated users can log errors" ON public.system_error_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated users can manage icons" ON public.app_icon_registry;
CREATE POLICY "Authenticated users can manage icons" ON public.app_icon_registry TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can place bets" ON public.game_bets;
CREATE POLICY "Authenticated users can place bets" ON public.game_bets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Authenticated users can read game server settings" ON public.game_server_settings;
CREATE POLICY "Authenticated users can read game server settings" ON public.game_server_settings FOR SELECT TO authenticated USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated users can report reels" ON public.reel_reports;
CREATE POLICY "Authenticated users can report reels" ON public.reel_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Authenticated users can send PK gifts" ON public.pk_battle_gifts;
CREATE POLICY "Authenticated users can send PK gifts" ON public.pk_battle_gifts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));

DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.party_room_messages;
CREATE POLICY "Authenticated users can send messages" ON public.party_room_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND ((EXISTS ( SELECT 1
   FROM public.party_room_participants
  WHERE ((party_room_participants.room_id = party_room_messages.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))) OR (EXISTS ( SELECT 1
   FROM public.party_rooms
  WHERE ((party_rooms.id = party_room_messages.room_id) AND (party_rooms.host_id = auth.uid())))))));

DROP POLICY IF EXISTS "Authenticated users can share reels" ON public.reel_shares;
CREATE POLICY "Authenticated users can share reels" ON public.reel_shares FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Authenticated users can view active role frames" ON public.role_frames;
CREATE POLICY "Authenticated users can view active role frames" ON public.role_frames FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Authenticated users can view agencies" ON public.agencies;
CREATE POLICY "Authenticated users can view agencies" ON public.agencies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.helper_admin_messages;
CREATE POLICY "Authenticated users can view all messages" ON public.helper_admin_messages FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated users can view all payment methods" ON public.topup_payment_methods;
CREATE POLICY "Authenticated users can view all payment methods" ON public.topup_payment_methods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Call participants can view events" ON public.call_events;
CREATE POLICY "Call participants can view events" ON public.call_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.private_calls
  WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));

DROP POLICY IF EXISTS "Deny all direct access to OTPs" ON public.password_reset_otps;
CREATE POLICY "Deny all direct access to OTPs" ON public.password_reset_otps TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Everyone can view active exchange tiers" ON public.user_beans_exchange_tiers;
CREATE POLICY "Everyone can view active exchange tiers" ON public.user_beans_exchange_tiers FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Everyone can view trader level tiers" ON public.trader_level_tiers;
CREATE POLICY "Everyone can view trader level tiers" ON public.trader_level_tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Guest users can update own online status" ON public.profiles;
CREATE POLICY "Guest users can update own online status" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

DROP POLICY IF EXISTS "Helpers and admins can insert messages" ON public.helper_admin_messages;
CREATE POLICY "Helpers and admins can insert messages" ON public.helper_admin_messages FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.is_active = true))))));

DROP POLICY IF EXISTS "Helpers can create replies" ON public.helper_message_replies;
CREATE POLICY "Helpers can create replies" ON public.helper_message_replies FOR INSERT TO authenticated WITH CHECK (((sender_type = 'helper'::text) AND (sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.helper_admin_messages ham
     JOIN public.topup_helpers th ON ((ham.helper_id = th.id)))
  WHERE ((ham.id = helper_message_replies.message_id) AND (th.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Helpers can create topup requests" ON public.helper_topup_requests;
CREATE POLICY "Helpers can create topup requests" ON public.helper_topup_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Helpers can create transactions" ON public.helper_transactions;
CREATE POLICY "Helpers can create transactions" ON public.helper_transactions FOR INSERT TO authenticated WITH CHECK ((helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Helpers can create upgrade requests" ON public.helper_upgrade_requests;
CREATE POLICY "Helpers can create upgrade requests" ON public.helper_upgrade_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Helpers can delete their own payment methods" ON public.helper_country_payment_methods;
CREATE POLICY "Helpers can delete their own payment methods" ON public.helper_country_payment_methods FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can insert their own payment methods" ON public.helper_country_payment_methods;
CREATE POLICY "Helpers can insert their own payment methods" ON public.helper_country_payment_methods FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5) AND (topup_helpers.payroll_enabled = true)))));

DROP POLICY IF EXISTS "Helpers can manage own payment methods" ON public.helper_payment_methods;
CREATE POLICY "Helpers can manage own payment methods" ON public.helper_payment_methods TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can mark their messages as read" ON public.helper_admin_messages;
CREATE POLICY "Helpers can mark their messages as read" ON public.helper_admin_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_admin_messages.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can update limited own data" ON public.topup_helpers;
CREATE POLICY "Helpers can update limited own data" ON public.topup_helpers FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests;
CREATE POLICY "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_withdrawal_requests.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can update own notifications" ON public.helper_notifications;
CREATE POLICY "Helpers can update own notifications" ON public.helper_notifications FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_notifications.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can update their orders" ON public.helper_orders;
CREATE POLICY "Helpers can update their orders" ON public.helper_orders FOR UPDATE TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Helpers can update their own payment methods" ON public.helper_country_payment_methods;
CREATE POLICY "Helpers can update their own payment methods" ON public.helper_country_payment_methods FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests;
CREATE POLICY "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_withdrawal_requests.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can view own data" ON public.topup_helpers;
CREATE POLICY "Helpers can view own data" ON public.topup_helpers FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Helpers can view own notifications" ON public.helper_notifications;
CREATE POLICY "Helpers can view own notifications" ON public.helper_notifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_notifications.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can view own transactions" ON public.helper_transactions;
CREATE POLICY "Helpers can view own transactions" ON public.helper_transactions FOR SELECT TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Helpers can view replies on their messages" ON public.helper_message_replies;
CREATE POLICY "Helpers can view replies on their messages" ON public.helper_message_replies FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.helper_admin_messages ham
     JOIN public.topup_helpers th ON ((ham.helper_id = th.id)))
  WHERE ((ham.id = helper_message_replies.message_id) AND (th.user_id = auth.uid())))) OR (sender_id = auth.uid())));

DROP POLICY IF EXISTS "Helpers can view their assigned countries" ON public.helper_assigned_countries;
CREATE POLICY "Helpers can view their assigned countries" ON public.helper_assigned_countries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_assigned_countries.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can view their orders" ON public.helper_orders;
CREATE POLICY "Helpers can view their orders" ON public.helper_orders FOR SELECT TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Helpers can view their own messages" ON public.helper_admin_messages;
CREATE POLICY "Helpers can view their own messages" ON public.helper_admin_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.id = helper_admin_messages.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Helpers can view their own topup requests" ON public.helper_topup_requests;
CREATE POLICY "Helpers can view their own topup requests" ON public.helper_topup_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Helpers can view their own upgrade requests" ON public.helper_upgrade_requests;
CREATE POLICY "Helpers can view their own upgrade requests" ON public.helper_upgrade_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Hosts can cancel their own pending requests" ON public.agency_hosts;
CREATE POLICY "Hosts can cancel their own pending requests" ON public.agency_hosts FOR DELETE TO authenticated USING (((host_id = auth.uid()) AND (status = 'pending'::text)));

DROP POLICY IF EXISTS "Hosts can create reels" ON public.reels;
CREATE POLICY "Hosts can create reels" ON public.reels FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Hosts can create seat invitations" ON public.seat_invitations;
CREATE POLICY "Hosts can create seat invitations" ON public.seat_invitations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.party_rooms
  WHERE ((party_rooms.id = seat_invitations.room_id) AND (party_rooms.host_id = auth.uid())))));

DROP POLICY IF EXISTS "Hosts can create streams" ON public.live_streams;
CREATE POLICY "Hosts can create streams" ON public.live_streams FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Hosts can delete own streams" ON public.live_streams;
CREATE POLICY "Hosts can delete own streams" ON public.live_streams FOR DELETE TO authenticated USING ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Hosts can delete their invitations" ON public.seat_invitations;
CREATE POLICY "Hosts can delete their invitations" ON public.seat_invitations FOR DELETE TO authenticated USING ((host_id = auth.uid()));

DROP POLICY IF EXISTS "Hosts can delete their rooms" ON public.party_rooms;
CREATE POLICY "Hosts can delete their rooms" ON public.party_rooms FOR DELETE TO authenticated USING ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Hosts can update own streams" ON public.live_streams;
CREATE POLICY "Hosts can update own streams" ON public.live_streams FOR UPDATE TO authenticated USING ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Hosts can update participants in their rooms" ON public.party_room_participants;
CREATE POLICY "Hosts can update participants in their rooms" ON public.party_room_participants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.party_rooms
  WHERE ((party_rooms.id = party_room_participants.room_id) AND (party_rooms.host_id = auth.uid()) AND (party_rooms.is_active = true)))));

DROP POLICY IF EXISTS "Hosts can update their rooms" ON public.party_rooms;
CREATE POLICY "Hosts can update their rooms" ON public.party_rooms FOR UPDATE TO authenticated USING ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Hosts can view their own transfers" ON public.agency_earnings_transfers;
CREATE POLICY "Hosts can view their own transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND (host_id = auth.uid())));

DROP POLICY IF EXISTS "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals;
CREATE POLICY "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals FOR UPDATE TO authenticated USING ((public.is_real_user() AND (EXISTS ( SELECT 1
   FROM (public.topup_helpers th
     JOIN public.helper_assigned_countries hac ON ((hac.helper_id = th.id)))
  WHERE ((th.user_id = auth.uid()) AND (th.trader_level = 5) AND (th.payroll_enabled = true) AND (th.is_active = true) AND (hac.country_code = agency_withdrawals.country_code) AND (hac.is_active = true))))));

DROP POLICY IF EXISTS "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests;
CREATE POLICY "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests FOR UPDATE TO authenticated USING ((trader_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5)))));

DROP POLICY IF EXISTS "Level 5 traders can view assigned payroll requests" ON public.payroll_requests;
CREATE POLICY "Level 5 traders can view assigned payroll requests" ON public.payroll_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.topup_helpers
  WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5) AND (topup_helpers.payroll_enabled = true) AND (topup_helpers.is_verified = true)))));

DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages;
CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = group_messages.group_id) AND (gm.user_id = auth.uid())))) AND (auth.uid() = sender_id)));

DROP POLICY IF EXISTS "Members can view group messages" ON public.group_messages;
CREATE POLICY "Members can view group messages" ON public.group_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = group_messages.group_id) AND (gm.user_id = auth.uid())))));

DROP POLICY IF EXISTS "No direct access" ON public.recovery_tokens;
CREATE POLICY "No direct access" ON public.recovery_tokens FOR SELECT USING (false);

DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
CREATE POLICY "No direct admin deletes" ON public.admin_users FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
CREATE POLICY "No direct admin inserts" ON public.admin_users FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
CREATE POLICY "No direct admin updates" ON public.admin_users FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
CREATE POLICY "No direct admin_logs deletes" ON public.admin_logs FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
CREATE POLICY "No direct admin_logs inserts" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
CREATE POLICY "No direct admin_logs updates" ON public.admin_logs FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct agency deletes" ON public.agencies;
CREATE POLICY "No direct agency deletes" ON public.agencies FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
CREATE POLICY "No direct agency diamond inserts" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct bet inserts" ON public.live_game_bets;
CREATE POLICY "No direct bet inserts" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct bet updates" ON public.live_game_bets;
CREATE POLICY "No direct bet updates" ON public.live_game_bets FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct coin transfer inserts" ON public.coin_transfers;
CREATE POLICY "No direct coin transfer inserts" ON public.coin_transfers FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct coin_package deletes" ON public.coin_packages;
CREATE POLICY "No direct coin_package deletes" ON public.coin_packages FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct coin_package inserts" ON public.coin_packages;
CREATE POLICY "No direct coin_package inserts" ON public.coin_packages FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct coin_package updates" ON public.coin_packages;
CREATE POLICY "No direct coin_package updates" ON public.coin_packages FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct coin_transfer deletes" ON public.coin_transfers;
CREATE POLICY "No direct coin_transfer deletes" ON public.coin_transfers FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct coin_transfer updates" ON public.coin_transfers;
CREATE POLICY "No direct coin_transfer updates" ON public.coin_transfers FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct game deletes" ON public.game_transactions;
CREATE POLICY "No direct game deletes" ON public.game_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct game player updates" ON public.game_players;
CREATE POLICY "No direct game player updates" ON public.game_players FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct game round inserts" ON public.live_game_rounds;
CREATE POLICY "No direct game round inserts" ON public.live_game_rounds FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct game round updates" ON public.live_game_rounds;
CREATE POLICY "No direct game round updates" ON public.live_game_rounds FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct game transaction inserts" ON public.game_transactions;
CREATE POLICY "No direct game transaction inserts" ON public.game_transactions FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct game updates" ON public.game_transactions;
CREATE POLICY "No direct game updates" ON public.game_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct gift deletes" ON public.gift_transactions;
CREATE POLICY "No direct gift deletes" ON public.gift_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct gift log inserts" ON public.gift_transaction_logs;
CREATE POLICY "No direct gift log inserts" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct gift transaction inserts" ON public.gift_transactions;
CREATE POLICY "No direct gift transaction inserts" ON public.gift_transactions FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct gift updates" ON public.gift_transactions;
CREATE POLICY "No direct gift updates" ON public.gift_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct notification inserts" ON public.notifications;
CREATE POLICY "No direct notification inserts" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct performance updates" ON public.agency_performance;
CREATE POLICY "No direct performance updates" ON public.agency_performance FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
CREATE POLICY "No direct perm deletes" ON public.admin_section_permissions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
CREATE POLICY "No direct perm inserts" ON public.admin_section_permissions FOR INSERT TO authenticated WITH CHECK (false);