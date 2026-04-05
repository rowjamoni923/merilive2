-- === RLS Batch 4 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view approved active reels" ON public.reels;
END $$;
CREATE POLICY "Anyone can view approved active reels" ON public.reels FOR SELECT TO authenticated USING (((is_active = true) AND (is_approved = true)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view branding settings" ON public.branding_settings;
END $$;
CREATE POLICY "Anyone can view branding settings" ON public.branding_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view currency rates" ON public.currency_rates;
END $$;
CREATE POLICY "Anyone can view currency rates" ON public.currency_rates FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view feature requirements" ON public.feature_level_requirements;
END $$;
CREATE POLICY "Anyone can view feature requirements" ON public.feature_level_requirements FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view first recharge config" ON public.first_recharge_bonus;
END $$;
CREATE POLICY "Anyone can view first recharge config" ON public.first_recharge_bonus FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view followers" ON public.followers;
END $$;
CREATE POLICY "Anyone can view followers" ON public.followers FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view frames" ON public.avatar_frames;
END $$;
CREATE POLICY "Anyone can view frames" ON public.avatar_frames FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view game players" ON public.game_players;
END $$;
CREATE POLICY "Anyone can view game players" ON public.game_players FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view game sessions" ON public.game_sessions;
END $$;
CREATE POLICY "Anyone can view game sessions" ON public.game_sessions FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view game stats" ON public.game_stats;
END $$;
CREATE POLICY "Anyone can view game stats" ON public.game_stats FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view gift categories" ON public.gift_categories;
END $$;
CREATE POLICY "Anyone can view gift categories" ON public.gift_categories FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view helper diamond packages" ON public.helper_diamond_packages;
END $$;
CREATE POLICY "Anyone can view helper diamond packages" ON public.helper_diamond_packages FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view level config" ON public.helper_level_config;
END $$;
CREATE POLICY "Anyone can view level config" ON public.helper_level_config FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view level tiers" ON public.user_level_tiers;
END $$;
CREATE POLICY "Anyone can view level tiers" ON public.user_level_tiers FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view live game rounds" ON public.live_game_rounds;
END $$;
CREATE POLICY "Anyone can view live game rounds" ON public.live_game_rounds FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view login rewards config" ON public.daily_login_rewards_config;
END $$;
CREATE POLICY "Anyone can view login rewards config" ON public.daily_login_rewards_config FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view moderation settings" ON public.live_moderation_settings;
END $$;
CREATE POLICY "Anyone can view moderation settings" ON public.live_moderation_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view penalty tiers" ON public.violation_penalty_tiers;
END $$;
CREATE POLICY "Anyone can view penalty tiers" ON public.violation_penalty_tiers FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view performance" ON public.agency_performance;
END $$;
CREATE POLICY "Anyone can view performance" ON public.agency_performance FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view rankings" ON public.agency_rankings;
END $$;
CREATE POLICY "Anyone can view rankings" ON public.agency_rankings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view reel likes" ON public.reel_likes;
END $$;
CREATE POLICY "Anyone can view reel likes" ON public.reel_likes FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view reward config" ON public.leaderboard_reward_config;
END $$;
CREATE POLICY "Anyone can view reward config" ON public.leaderboard_reward_config FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view rewards config" ON public.ranking_rewards;
END $$;
CREATE POLICY "Anyone can view rewards config" ON public.ranking_rewards FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view room participants" ON public.party_room_participants;
END $$;
CREATE POLICY "Anyone can view room participants" ON public.party_room_participants FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view roulette sessions" ON public.roulette_sessions;
END $$;
CREATE POLICY "Anyone can view roulette sessions" ON public.roulette_sessions FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view seat requests in their room" ON public.seat_requests;
END $$;
CREATE POLICY "Anyone can view seat requests in their room" ON public.seat_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.party_room_participants WHERE ((party_room_participants.room_id = seat_requests.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shares" ON public.reel_shares;
END $$;
CREATE POLICY "Anyone can view shares" ON public.reel_shares FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shop items" ON public.shop_items;
END $$;
CREATE POLICY "Anyone can view shop items" ON public.shop_items FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shop items public" ON public.shop_items;
END $$;
CREATE POLICY "Anyone can view shop items public" ON public.shop_items FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
END $$;
CREATE POLICY "Anyone can view site settings" ON public.site_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view stream chat" ON public.stream_chat;
END $$;
CREATE POLICY "Anyone can view stream chat" ON public.stream_chat FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view stream viewers" ON public.stream_viewers;
END $$;
CREATE POLICY "Anyone can view stream viewers" ON public.stream_viewers FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view verified invitations for leaderboard" ON public.user_invitations;
END $$;
CREATE POLICY "Anyone can view verified invitations for leaderboard" ON public.user_invitations FOR SELECT TO authenticated USING ((status = 'verified'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated admins can view all applications" ON public.host_applications;
END $$;
CREATE POLICY "Authenticated admins can view all applications" ON public.host_applications FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can check lockout status" ON public.account_lockouts;
END $$;
CREATE POLICY "Authenticated can check lockout status" ON public.account_lockouts FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can insert own violations" ON public.host_contact_violations;
END $$;
CREATE POLICY "Authenticated can insert own violations" ON public.host_contact_violations FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can read allowed links" ON public.allowed_external_links;
END $$;
CREATE POLICY "Authenticated can read allowed links" ON public.allowed_external_links FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view all banners" ON public.party_room_banners;
END $$;
CREATE POLICY "Authenticated can view all banners" ON public.party_room_banners FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view all bets" ON public.game_bets;
END $$;
CREATE POLICY "Authenticated can view all bets" ON public.game_bets FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view all games" ON public.game_settings;
END $$;
CREATE POLICY "Authenticated can view all games" ON public.game_settings FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view errors" ON public.system_error_logs;
END $$;
CREATE POLICY "Authenticated can view errors" ON public.system_error_logs FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view game stats" ON public.game_stats;
END $$;
CREATE POLICY "Authenticated can view game stats" ON public.game_stats FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view non-blocked profiles" ON public.profiles;
END $$;
CREATE POLICY "Authenticated can view non-blocked profiles" ON public.profiles FOR SELECT USING (((auth.uid() IS NOT NULL) AND (is_blocked = false)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view own violations" ON public.host_contact_violations;
END $$;
CREATE POLICY "Authenticated can view own violations" ON public.host_contact_violations FOR SELECT TO authenticated USING (((auth.uid() = host_id) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can chat" ON public.stream_chat;
END $$;
CREATE POLICY "Authenticated users can chat" ON public.stream_chat FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can comment" ON public.reel_comments;
END $$;
CREATE POLICY "Authenticated users can comment" ON public.reel_comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create PK battles" ON public.pk_battles;
END $$;
CREATE POLICY "Authenticated users can create PK battles" ON public.pk_battles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = challenger_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create alerts" ON public.security_alerts;
END $$;
CREATE POLICY "Authenticated users can create alerts" ON public.security_alerts FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON public.game_sessions;
END $$;
CREATE POLICY "Authenticated users can create game sessions" ON public.game_sessions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = game_sessions.room_id) AND (party_rooms.host_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
END $$;
CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create party rooms" ON public.party_rooms;
END $$;
CREATE POLICY "Authenticated users can create party rooms" ON public.party_rooms FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can insert moderation logs" ON public.chat_moderation_logs;
END $$;
CREATE POLICY "Authenticated users can insert moderation logs" ON public.chat_moderation_logs FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can like reels" ON public.reel_likes;
END $$;
CREATE POLICY "Authenticated users can like reels" ON public.reel_likes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can log attempts" ON public.login_attempts;
END $$;
CREATE POLICY "Authenticated users can log attempts" ON public.login_attempts FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can log errors" ON public.system_error_logs;
END $$;
CREATE POLICY "Authenticated users can log errors" ON public.system_error_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can manage icons" ON public.app_icon_registry;
END $$;
CREATE POLICY "Authenticated users can manage icons" ON public.app_icon_registry TO authenticated USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can place bets" ON public.game_bets;
END $$;
CREATE POLICY "Authenticated users can place bets" ON public.game_bets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read game server settings" ON public.game_server_settings;
END $$;
CREATE POLICY "Authenticated users can read game server settings" ON public.game_server_settings FOR SELECT TO authenticated USING ((auth.role() = 'authenticated'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can report reels" ON public.reel_reports;
END $$;
CREATE POLICY "Authenticated users can report reels" ON public.reel_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can send PK gifts" ON public.pk_battle_gifts;
END $$;
CREATE POLICY "Authenticated users can send PK gifts" ON public.pk_battle_gifts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.party_room_messages;
END $$;
CREATE POLICY "Authenticated users can send messages" ON public.party_room_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND ((EXISTS ( SELECT 1 FROM public.party_room_participants WHERE ((party_room_participants.room_id = party_room_messages.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))) OR (EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = party_room_messages.room_id) AND (party_rooms.host_id = auth.uid())))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can share reels" ON public.reel_shares;
END $$;
CREATE POLICY "Authenticated users can share reels" ON public.reel_shares FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view active role frames" ON public.role_frames;
END $$;
CREATE POLICY "Authenticated users can view active role frames" ON public.role_frames FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view agencies" ON public.agencies;
END $$;
CREATE POLICY "Authenticated users can view agencies" ON public.agencies FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.helper_admin_messages;
END $$;
CREATE POLICY "Authenticated users can view all messages" ON public.helper_admin_messages FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view all payment methods" ON public.topup_payment_methods;
END $$;
CREATE POLICY "Authenticated users can view all payment methods" ON public.topup_payment_methods FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Call participants can view events" ON public.call_events;
END $$;
CREATE POLICY "Call participants can view events" ON public.call_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.private_calls WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Deny all direct access to OTPs" ON public.password_reset_otps;
END $$;
CREATE POLICY "Deny all direct access to OTPs" ON public.password_reset_otps TO authenticated USING (false) WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Everyone can view active exchange tiers" ON public.user_beans_exchange_tiers;
END $$;
CREATE POLICY "Everyone can view active exchange tiers" ON public.user_beans_exchange_tiers FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Everyone can view trader level tiers" ON public.trader_level_tiers;
END $$;
CREATE POLICY "Everyone can view trader level tiers" ON public.trader_level_tiers FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Guest users can update own online status" ON public.profiles;
END $$;
CREATE POLICY "Guest users can update own online status" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers and admins can insert messages" ON public.helper_admin_messages;
END $$;
CREATE POLICY "Helpers and admins can insert messages" ON public.helper_admin_messages FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.is_active = true))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create replies" ON public.helper_message_replies;
END $$;
CREATE POLICY "Helpers can create replies" ON public.helper_message_replies FOR INSERT TO authenticated WITH CHECK (((sender_type = 'helper'::text) AND (sender_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM (public.helper_admin_messages ham JOIN public.topup_helpers th ON ((ham.helper_id = th.id))) WHERE ((ham.id = helper_message_replies.message_id) AND (th.user_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create topup requests" ON public.helper_topup_requests;
END $$;
CREATE POLICY "Helpers can create topup requests" ON public.helper_topup_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create transactions" ON public.helper_transactions;
END $$;
CREATE POLICY "Helpers can create transactions" ON public.helper_transactions FOR INSERT TO authenticated WITH CHECK ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create upgrade requests" ON public.helper_upgrade_requests;
END $$;
CREATE POLICY "Helpers can create upgrade requests" ON public.helper_upgrade_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can delete their own payment methods" ON public.helper_country_payment_methods;
END $$;
CREATE POLICY "Helpers can delete their own payment methods" ON public.helper_country_payment_methods FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can insert their own payment methods" ON public.helper_country_payment_methods;
END $$;
CREATE POLICY "Helpers can insert their own payment methods" ON public.helper_country_payment_methods FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5) AND (topup_helpers.payroll_enabled = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can manage own payment methods" ON public.helper_payment_methods;
END $$;
CREATE POLICY "Helpers can manage own payment methods" ON public.helper_payment_methods TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can mark their messages as read" ON public.helper_admin_messages;
END $$;
CREATE POLICY "Helpers can mark their messages as read" ON public.helper_admin_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_admin_messages.helper_id) AND (topup_helpers.user_id = auth.uid())))));

-- === RLS Batch 5 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update limited own data" ON public.topup_helpers;
END $$;
CREATE POLICY "Helpers can update limited own data" ON public.topup_helpers FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests;
END $$;
CREATE POLICY "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_withdrawal_requests.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update own notifications" ON public.helper_notifications;
END $$;
CREATE POLICY "Helpers can update own notifications" ON public.helper_notifications FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_notifications.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update their orders" ON public.helper_orders;
END $$;
CREATE POLICY "Helpers can update their orders" ON public.helper_orders FOR UPDATE TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update their own payment methods" ON public.helper_country_payment_methods;
END $$;
CREATE POLICY "Helpers can update their own payment methods" ON public.helper_country_payment_methods FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests;
END $$;
CREATE POLICY "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_withdrawal_requests.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view own data" ON public.topup_helpers;
END $$;
CREATE POLICY "Helpers can view own data" ON public.topup_helpers FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view own notifications" ON public.helper_notifications;
END $$;
CREATE POLICY "Helpers can view own notifications" ON public.helper_notifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_notifications.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view own transactions" ON public.helper_transactions;
END $$;
CREATE POLICY "Helpers can view own transactions" ON public.helper_transactions FOR SELECT TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view replies on their messages" ON public.helper_message_replies;
END $$;
CREATE POLICY "Helpers can view replies on their messages" ON public.helper_message_replies FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM (public.helper_admin_messages ham JOIN public.topup_helpers th ON ((ham.helper_id = th.id))) WHERE ((ham.id = helper_message_replies.message_id) AND (th.user_id = auth.uid())))) OR (sender_id = auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their assigned countries" ON public.helper_assigned_countries;
END $$;
CREATE POLICY "Helpers can view their assigned countries" ON public.helper_assigned_countries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_assigned_countries.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their orders" ON public.helper_orders;
END $$;
CREATE POLICY "Helpers can view their orders" ON public.helper_orders FOR SELECT TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their own messages" ON public.helper_admin_messages;
END $$;
CREATE POLICY "Helpers can view their own messages" ON public.helper_admin_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_admin_messages.helper_id) AND (topup_helpers.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their own topup requests" ON public.helper_topup_requests;
END $$;
CREATE POLICY "Helpers can view their own topup requests" ON public.helper_topup_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their own upgrade requests" ON public.helper_upgrade_requests;
END $$;
CREATE POLICY "Helpers can view their own upgrade requests" ON public.helper_upgrade_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can cancel their own pending requests" ON public.agency_hosts;
END $$;
CREATE POLICY "Hosts can cancel their own pending requests" ON public.agency_hosts FOR DELETE TO authenticated USING (((host_id = auth.uid()) AND (status = 'pending'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can create reels" ON public.reels;
END $$;
CREATE POLICY "Hosts can create reels" ON public.reels FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can create seat invitations" ON public.seat_invitations;
END $$;
CREATE POLICY "Hosts can create seat invitations" ON public.seat_invitations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = seat_invitations.room_id) AND (party_rooms.host_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can create streams" ON public.live_streams;
END $$;
CREATE POLICY "Hosts can create streams" ON public.live_streams FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can delete own streams" ON public.live_streams;
END $$;
CREATE POLICY "Hosts can delete own streams" ON public.live_streams FOR DELETE TO authenticated USING ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can delete their invitations" ON public.seat_invitations;
END $$;
CREATE POLICY "Hosts can delete their invitations" ON public.seat_invitations FOR DELETE TO authenticated USING ((host_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can delete their rooms" ON public.party_rooms;
END $$;
CREATE POLICY "Hosts can delete their rooms" ON public.party_rooms FOR DELETE TO authenticated USING ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can update own streams" ON public.live_streams;
END $$;
CREATE POLICY "Hosts can update own streams" ON public.live_streams FOR UPDATE TO authenticated USING ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can update participants in their rooms" ON public.party_room_participants;
END $$;
CREATE POLICY "Hosts can update participants in their rooms" ON public.party_room_participants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = party_room_participants.room_id) AND (party_rooms.host_id = auth.uid()) AND (party_rooms.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can update their rooms" ON public.party_rooms;
END $$;
CREATE POLICY "Hosts can update their rooms" ON public.party_rooms FOR UPDATE TO authenticated USING ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can view their own transfers" ON public.agency_earnings_transfers;
END $$;
CREATE POLICY "Hosts can view their own transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND (host_id = auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals;
END $$;
CREATE POLICY "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals FOR UPDATE TO authenticated USING ((public.is_real_user() AND (EXISTS ( SELECT 1 FROM (public.topup_helpers th JOIN public.helper_assigned_countries hac ON ((hac.helper_id = th.id))) WHERE ((th.user_id = auth.uid()) AND (th.trader_level = 5) AND (th.payroll_enabled = true) AND (th.is_active = true) AND (hac.country_code = agency_withdrawals.country_code) AND (hac.is_active = true))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests;
END $$;
CREATE POLICY "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests FOR UPDATE TO authenticated USING ((trader_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Level 5 traders can view assigned payroll requests" ON public.payroll_requests;
END $$;
CREATE POLICY "Level 5 traders can view assigned payroll requests" ON public.payroll_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5) AND (topup_helpers.payroll_enabled = true) AND (topup_helpers.is_verified = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages;
END $$;
CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1 FROM public.group_members gm WHERE ((gm.group_id = group_messages.group_id) AND (gm.user_id = auth.uid())))) AND (auth.uid() = sender_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view group messages" ON public.group_messages;
END $$;
CREATE POLICY "Members can view group messages" ON public.group_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.group_members gm WHERE ((gm.group_id = group_messages.group_id) AND (gm.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct access" ON public.recovery_tokens;
END $$;
CREATE POLICY "No direct access" ON public.recovery_tokens FOR SELECT USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
END $$;
CREATE POLICY "No direct admin deletes" ON public.admin_users FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
END $$;
CREATE POLICY "No direct admin inserts" ON public.admin_users FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
END $$;
CREATE POLICY "No direct admin updates" ON public.admin_users FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
END $$;
CREATE POLICY "No direct admin_logs deletes" ON public.admin_logs FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
END $$;
CREATE POLICY "No direct admin_logs inserts" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
END $$;
CREATE POLICY "No direct admin_logs updates" ON public.admin_logs FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct agency deletes" ON public.agencies;
END $$;
CREATE POLICY "No direct agency deletes" ON public.agencies FOR DELETE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
END $$;
CREATE POLICY "No direct agency diamond inserts" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct bet inserts" ON public.live_game_bets;
END $$;
CREATE POLICY "No direct bet inserts" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct bet updates" ON public.live_game_bets;
END $$;
CREATE POLICY "No direct bet updates" ON public.live_game_bets FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin transfer inserts" ON public.coin_transfers;
END $$;
CREATE POLICY "No direct coin transfer inserts" ON public.coin_transfers FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_package deletes" ON public.coin_packages;
END $$;
CREATE POLICY "No direct coin_package deletes" ON public.coin_packages FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_package inserts" ON public.coin_packages;
END $$;
CREATE POLICY "No direct coin_package inserts" ON public.coin_packages FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_package updates" ON public.coin_packages;
END $$;
CREATE POLICY "No direct coin_package updates" ON public.coin_packages FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_transfer deletes" ON public.coin_transfers;
END $$;
CREATE POLICY "No direct coin_transfer deletes" ON public.coin_transfers FOR DELETE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_transfer updates" ON public.coin_transfers;
END $$;
CREATE POLICY "No direct coin_transfer updates" ON public.coin_transfers FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game deletes" ON public.game_transactions;
END $$;
CREATE POLICY "No direct game deletes" ON public.game_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game player updates" ON public.game_players;
END $$;
CREATE POLICY "No direct game player updates" ON public.game_players FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game round inserts" ON public.live_game_rounds;
END $$;
CREATE POLICY "No direct game round inserts" ON public.live_game_rounds FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game round updates" ON public.live_game_rounds;
END $$;
CREATE POLICY "No direct game round updates" ON public.live_game_rounds FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game transaction inserts" ON public.game_transactions;
END $$;
CREATE POLICY "No direct game transaction inserts" ON public.game_transactions FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game updates" ON public.game_transactions;
END $$;
CREATE POLICY "No direct game updates" ON public.game_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift deletes" ON public.gift_transactions;
END $$;
CREATE POLICY "No direct gift deletes" ON public.gift_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift log inserts" ON public.gift_transaction_logs;
END $$;
CREATE POLICY "No direct gift log inserts" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift transaction inserts" ON public.gift_transactions;
END $$;
CREATE POLICY "No direct gift transaction inserts" ON public.gift_transactions FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift updates" ON public.gift_transactions;
END $$;
CREATE POLICY "No direct gift updates" ON public.gift_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct notification inserts" ON public.notifications;
END $$;
CREATE POLICY "No direct notification inserts" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct performance updates" ON public.agency_performance;
END $$;
CREATE POLICY "No direct performance updates" ON public.agency_performance FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
END $$;
CREATE POLICY "No direct perm deletes" ON public.admin_section_permissions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
END $$;
CREATE POLICY "No direct perm inserts" ON public.admin_section_permissions FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
END $$;
CREATE POLICY "No direct perm updates" ON public.admin_section_permissions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct profile deletes" ON public.profiles;
END $$;
CREATE POLICY "No direct profile deletes" ON public.profiles FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct recharge deletes" ON public.recharge_transactions;
END $$;
CREATE POLICY "No direct recharge deletes" ON public.recharge_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct recharge updates" ON public.recharge_transactions;
END $$;
CREATE POLICY "No direct recharge updates" ON public.recharge_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct recording inserts" ON public.stream_recordings;
END $$;
CREATE POLICY "No direct recording inserts" ON public.stream_recordings FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct recording updates" ON public.stream_recordings;
END $$;
CREATE POLICY "No direct recording updates" ON public.stream_recordings FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct roulette bet inserts" ON public.roulette_bets;
END $$;
CREATE POLICY "No direct roulette bet inserts" ON public.roulette_bets FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct roulette session creation" ON public.roulette_sessions;
END $$;
CREATE POLICY "No direct roulette session creation" ON public.roulette_sessions FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct roulette session updates" ON public.roulette_sessions;
END $$;
CREATE POLICY "No direct roulette session updates" ON public.roulette_sessions FOR UPDATE TO authenticated USING (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct security log inserts" ON public.private_call_security_logs;
END $$;
CREATE POLICY "No direct security log inserts" ON public.private_call_security_logs FOR INSERT TO authenticated WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No public access to admin_login_otps" ON public.admin_login_otps;
END $$;
CREATE POLICY "No public access to admin_login_otps" ON public.admin_login_otps TO authenticated USING (false) WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "No public access to rate_limit_attempts" ON public.rate_limit_attempts;
END $$;
CREATE POLICY "No public access to rate_limit_attempts" ON public.rate_limit_attempts TO authenticated USING (false) WITH CHECK (false);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can create orders" ON public.subscription_orders;
END $$;
CREATE POLICY "Only admins can create orders" ON public.subscription_orders FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can delete allowed links" ON public.allowed_external_links;
END $$;
CREATE POLICY "Only admins can delete allowed links" ON public.allowed_external_links FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can delete payment methods" ON public.topup_payment_methods;
END $$;
CREATE POLICY "Only admins can delete payment methods" ON public.topup_payment_methods FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can insert allowed links" ON public.allowed_external_links;
END $$;
CREATE POLICY "Only admins can insert allowed links" ON public.allowed_external_links FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can insert game settings" ON public.game_settings;
END $$;
CREATE POLICY "Only admins can insert game settings" ON public.game_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can insert payment methods" ON public.topup_payment_methods;
END $$;
CREATE POLICY "Only admins can insert payment methods" ON public.topup_payment_methods FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- === RLS Batch 6 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage agency policies" ON public.agency_policy_settings;
END $$;
CREATE POLICY "Only admins can manage agency policies" ON public.agency_policy_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage banned devices" ON public.banned_devices;
END $$;
CREATE POLICY "Only admins can manage banned devices" ON public.banned_devices TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage content" ON public.app_content;
END $$;
CREATE POLICY "Only admins can manage content" ON public.app_content TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage feature requirements" ON public.feature_level_requirements;
END $$;
CREATE POLICY "Only admins can manage feature requirements" ON public.feature_level_requirements TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage music" ON public.admin_music_library;
END $$;
CREATE POLICY "Only admins can manage music" ON public.admin_music_library TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage notices" ON public.admin_notices;
END $$;
CREATE POLICY "Only admins can manage notices" ON public.admin_notices TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage party room banners" ON public.party_room_banners;
END $$;
CREATE POLICY "Only admins can manage party room banners" ON public.party_room_banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage payroll_requests" ON public.payroll_requests;
END $$;
CREATE POLICY "Only admins can manage payroll_requests" ON public.payroll_requests TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage provider games" ON public.provider_games;
END $$;
CREATE POLICY "Only admins can manage provider games" ON public.provider_games TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage rankings" ON public.agency_rankings;
END $$;
CREATE POLICY "Only admins can manage rankings" ON public.agency_rankings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage settings" ON public.app_settings;
END $$;
CREATE POLICY "Only admins can manage settings" ON public.app_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage shop items" ON public.shop_items;
END $$;
CREATE POLICY "Only admins can manage shop items" ON public.shop_items TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage site_settings" ON public.site_settings;
END $$;
CREATE POLICY "Only admins can manage site_settings" ON public.site_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage sports" ON public.sports;
END $$;
CREATE POLICY "Only admins can manage sports" ON public.sports TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage subscription_plans" ON public.subscription_plans;
END $$;
CREATE POLICY "Only admins can manage subscription_plans" ON public.subscription_plans TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage version settings" ON public.app_version_settings;
END $$;
CREATE POLICY "Only admins can manage version settings" ON public.app_version_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can manage youtube_sources" ON public.youtube_sources;
END $$;
CREATE POLICY "Only admins can manage youtube_sources" ON public.youtube_sources TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can register devices" ON public.admin_allowed_devices;
END $$;
CREATE POLICY "Only admins can register devices" ON public.admin_allowed_devices FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update allowed links" ON public.allowed_external_links;
END $$;
CREATE POLICY "Only admins can update allowed links" ON public.allowed_external_links FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update applications" ON public.host_applications;
END $$;
CREATE POLICY "Only admins can update applications" ON public.host_applications FOR UPDATE TO authenticated USING ((((auth.uid() = user_id) AND (status = 'pending'::text)) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update branding" ON public.branding_settings;
END $$;
CREATE POLICY "Only admins can update branding" ON public.branding_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update game sessions" ON public.game_sessions;
END $$;
CREATE POLICY "Only admins can update game sessions" ON public.game_sessions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update game settings" ON public.game_settings;
END $$;
CREATE POLICY "Only admins can update game settings" ON public.game_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update gift logs" ON public.gift_transaction_logs;
END $$;
CREATE POLICY "Only admins can update gift logs" ON public.gift_transaction_logs FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update payment methods" ON public.topup_payment_methods;
END $$;
CREATE POLICY "Only admins can update payment methods" ON public.topup_payment_methods FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update submissions" ON public.face_verification_submissions;
END $$;
CREATE POLICY "Only admins can update submissions" ON public.face_verification_submissions FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR ((auth.uid() = user_id) AND (status = 'pending'::text))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update topup requests" ON public.helper_topup_requests;
END $$;
CREATE POLICY "Only admins can update topup requests" ON public.helper_topup_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins can update transactions" ON public.payment_transactions;
END $$;
CREATE POLICY "Only admins can update transactions" ON public.payment_transactions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Only admins manage agency hosts" ON public.agency_hosts;
END $$;
CREATE POLICY "Only admins manage agency hosts" ON public.agency_hosts TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can delete their groups" ON public.groups;
END $$;
CREATE POLICY "Owners can delete their groups" ON public.groups FOR DELETE TO authenticated USING ((auth.uid() = owner_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can manage all admin users" ON public.admin_users;
END $$;
CREATE POLICY "Owners can manage all admin users" ON public.admin_users TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can manage all devices" ON public.admin_allowed_devices;
END $$;
CREATE POLICY "Owners can manage all devices" ON public.admin_allowed_devices TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can manage invitations" ON public.admin_invitations;
END $$;
CREATE POLICY "Owners can manage invitations" ON public.admin_invitations TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can manage permissions" ON public.admin_section_permissions;
END $$;
CREATE POLICY "Owners can manage permissions" ON public.admin_section_permissions TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can manage sections" ON public.admin_sections;
END $$;
CREATE POLICY "Owners can manage sections" ON public.admin_sections TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can update own agency stats" ON public.agencies;
END $$;
CREATE POLICY "Owners can update own agency stats" ON public.agencies FOR UPDATE USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owners can update their groups" ON public.groups;
END $$;
CREATE POLICY "Owners can update their groups" ON public.groups FOR UPDATE TO authenticated USING ((auth.uid() = owner_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can update PK battles" ON public.pk_battles;
END $$;
CREATE POLICY "Participants can update PK battles" ON public.pk_battles FOR UPDATE TO authenticated USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can update own calls" ON public.private_calls;
END $$;
CREATE POLICY "Participants can update own calls" ON public.private_calls FOR UPDATE TO authenticated USING (((auth.uid() = caller_id) OR (auth.uid() = host_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view room messages" ON public.party_room_messages;
END $$;
CREATE POLICY "Participants can view room messages" ON public.party_room_messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM public.party_room_participants WHERE ((party_room_participants.room_id = party_room_messages.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))) OR (EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = party_room_messages.room_id) AND (party_rooms.host_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Party room banners are viewable by everyone" ON public.party_room_banners;
END $$;
CREATE POLICY "Party room banners are viewable by everyone" ON public.party_room_banners FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Payment methods are viewable by everyone" ON public.payment_methods;
END $$;
CREATE POLICY "Payment methods are viewable by everyone" ON public.payment_methods FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public can view active news sources" ON public.news_sources;
END $$;
CREATE POLICY "Public can view active news sources" ON public.news_sources FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public can view active youtube sources" ON public.youtube_sources;
END $$;
CREATE POLICY "Public can view active youtube sources" ON public.youtube_sources FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage vpn logs" ON public.vpn_detection_logs;
END $$;
CREATE POLICY "Service role can manage vpn logs" ON public.vpn_detection_logs TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access on reconciliation" ON public.payment_reconciliation_log;
END $$;
CREATE POLICY "Service role full access on reconciliation" ON public.payment_reconciliation_log TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to audit logs" ON public.security_audit_log;
END $$;
CREATE POLICY "Service role full access to audit logs" ON public.security_audit_log TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to blocked IPs" ON public.blocked_ips;
END $$;
CREATE POLICY "Service role full access to blocked IPs" ON public.blocked_ips TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages failed logins" ON public.failed_login_attempts;
END $$;
CREATE POLICY "Service role manages failed logins" ON public.failed_login_attempts TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.user_subscriptions;
END $$;
CREATE POLICY "Service role manages subscriptions" ON public.user_subscriptions TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Stream viewers can see gifts" ON public.gift_transactions;
END $$;
CREATE POLICY "Stream viewers can see gifts" ON public.gift_transactions FOR SELECT USING (((stream_id IS NOT NULL) AND (auth.uid() IS NOT NULL)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Sub-agents can view their commissions" ON public.sub_agent_commissions;
END $$;
CREATE POLICY "Sub-agents can view their commissions" ON public.sub_agent_commissions FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT sub_agents.user_id FROM public.sub_agents WHERE (sub_agents.id = sub_agent_commissions.sub_agent_id))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Sub-agents can view their referrals" ON public.sub_agent_referrals;
END $$;
CREATE POLICY "Sub-agents can view their referrals" ON public.sub_agent_referrals FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT sub_agents.user_id FROM public.sub_agents WHERE (sub_agents.id = sub_agent_referrals.sub_agent_id))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can insert call events" ON public.call_events;
END $$;
CREATE POLICY "System can insert call events" ON public.call_events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.private_calls WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can manage bonus progress" ON public.new_host_live_bonus_progress;
END $$;
CREATE POLICY "System can manage bonus progress" ON public.new_host_live_bonus_progress TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can manage lockouts" ON public.account_lockouts;
END $$;
CREATE POLICY "System can manage lockouts" ON public.account_lockouts TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can manage rate limits" ON public.rate_limits;
END $$;
CREATE POLICY "System can manage rate limits" ON public.rate_limits TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Traders can create level purchases" ON public.trader_level_purchases;
END $$;
CREATE POLICY "Traders can create level purchases" ON public.trader_level_purchases FOR INSERT TO authenticated WITH CHECK ((trader_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Traders can view their own level purchases" ON public.trader_level_purchases;
END $$;
CREATE POLICY "Traders can view their own level purchases" ON public.trader_level_purchases FOR SELECT TO authenticated USING ((trader_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "User level thresholds are publicly readable" ON public.user_level_thresholds;
END $$;
CREATE POLICY "User level thresholds are publicly readable" ON public.user_level_thresholds FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can acquire entry banners" ON public.user_entry_banners;
END $$;
CREATE POLICY "Users can acquire entry banners" ON public.user_entry_banners FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can block others" ON public.user_blocks;
END $$;
CREATE POLICY "Users can block others" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (((blocker_id = auth.uid()) AND (blocked_id <> auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can claim first recharge" ON public.first_recharge_claims;
END $$;
CREATE POLICY "Users can claim first recharge" ON public.first_recharge_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can claim offers" ON public.limited_offer_claims;
END $$;
CREATE POLICY "Users can claim offers" ON public.limited_offer_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can claim rewards" ON public.invitation_reward_claims;
END $$;
CREATE POLICY "Users can claim rewards" ON public.invitation_reward_claims FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can claim their returns" ON public.consumption_return_history;
END $$;
CREATE POLICY "Users can claim their returns" ON public.consumption_return_history FOR UPDATE USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create calls" ON public.private_calls;
END $$;
CREATE POLICY "Users can create calls" ON public.private_calls FOR INSERT TO authenticated WITH CHECK ((auth.uid() = caller_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
END $$;
CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (((auth.uid() = participant_1) OR (auth.uid() = participant_2)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create invitations" ON public.user_invitations;
END $$;
CREATE POLICY "Users can create invitations" ON public.user_invitations FOR INSERT TO authenticated WITH CHECK (((auth.uid() = inviter_id) OR (auth.uid() = invited_user_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create orders" ON public.helper_orders;
END $$;
CREATE POLICY "Users can create orders" ON public.helper_orders FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create own agency or admins" ON public.agencies;
END $$;
CREATE POLICY "Users can create own agency or admins" ON public.agencies FOR INSERT TO authenticated WITH CHECK (((auth.uid() = owner_id) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create own exchanges" ON public.user_beans_exchange_history;
END $$;
CREATE POLICY "Users can create own exchanges" ON public.user_beans_exchange_history FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create own requests" ON public.host_conversion_requests;
END $$;
CREATE POLICY "Users can create own requests" ON public.host_conversion_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create purchases" ON public.user_purchases;
END $$;
CREATE POLICY "Users can create purchases" ON public.user_purchases FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create reports" ON public.user_reports;
END $$;
CREATE POLICY "Users can create reports" ON public.user_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create their own seat requests" ON public.seat_requests;
END $$;
CREATE POLICY "Users can create their own seat requests" ON public.seat_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = requester_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create their own submissions" ON public.face_verification_submissions;
END $$;
CREATE POLICY "Users can create their own submissions" ON public.face_verification_submissions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create their own transactions" ON public.payment_transactions;
END $$;
CREATE POLICY "Users can create their own transactions" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create tickets" ON public.support_tickets;
END $$;
CREATE POLICY "Users can create tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create transactions" ON public.recharge_transactions;
END $$;
CREATE POLICY "Users can create transactions" ON public.recharge_transactions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));