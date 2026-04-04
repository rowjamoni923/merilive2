
-- =====================================================
-- CRITICAL SECURITY FIX: Remove ALL "Always True" public policies
-- and fix Anonymous Access on INSERT/UPDATE/DELETE/ALL
-- =====================================================

-- ========== 1. FIX CRITICAL "Always True" PUBLIC POLICIES ==========

-- live_game_rounds: Remove "System can manage" (ALL USING true TO public)
DROP POLICY IF EXISTS "System can manage live game rounds" ON public.live_game_rounds;

-- payroll_requests: Remove "Allow all" (ALL USING true TO public)  
DROP POLICY IF EXISTS "Allow all for payroll_requests" ON public.payroll_requests;
-- Keep the specific policies, add admin management
CREATE POLICY "Only admins can manage payroll_requests"
  ON public.payroll_requests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- site_settings: Remove "Allow all" (ALL USING true TO public)
DROP POLICY IF EXISTS "Allow all for site_settings" ON public.site_settings;
CREATE POLICY "Anyone can read site_settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Only admins can manage site_settings"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- sports: Remove "Allow all" (ALL USING true TO public)
DROP POLICY IF EXISTS "Allow all for sports" ON public.sports;
CREATE POLICY "Anyone can read sports" ON public.sports FOR SELECT USING (true);
CREATE POLICY "Only admins can manage sports"
  ON public.sports FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- subscription_plans: Remove "Allow all" (ALL USING true TO public)
DROP POLICY IF EXISTS "Allow all for subscription_plans" ON public.subscription_plans;
CREATE POLICY "Anyone can read subscription_plans" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Only admins can manage subscription_plans"
  ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- user_subscriptions: Remove "Service role can manage" (ALL USING true TO public)
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role manages subscriptions"
  ON public.user_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- youtube_sources: Remove "Authenticated users can manage" (ALL USING true TO public)
DROP POLICY IF EXISTS "Authenticated users can manage youtube sources" ON public.youtube_sources;
CREATE POLICY "Anyone can read youtube_sources" ON public.youtube_sources FOR SELECT USING (true);
CREATE POLICY "Only admins can manage youtube_sources"
  ON public.youtube_sources FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== 2. FIX "Always True" AUTHENTICATED POLICIES ==========

-- party_room_banners: "Authenticated can manage" should be admin only
DROP POLICY IF EXISTS "Authenticated can manage party room banners" ON public.party_room_banners;
CREATE POLICY "Only admins can manage party room banners"
  ON public.party_room_banners FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- provider_games: "Authenticated users can manage" should be admin only
DROP POLICY IF EXISTS "Authenticated users can manage provider games" ON public.provider_games;
CREATE POLICY "Only admins can manage provider games"
  ON public.provider_games FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- feature_level_requirements: "Authenticated users can manage" should be admin only
DROP POLICY IF EXISTS "Authenticated users can manage feature requirements" ON public.feature_level_requirements;
CREATE POLICY "Only admins can manage feature requirements"
  ON public.feature_level_requirements FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- shop_items: "Authenticated can manage" should be admin only
DROP POLICY IF EXISTS "Authenticated can manage shop items" ON public.shop_items;
CREATE POLICY "Only admins can manage shop items"
  ON public.shop_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ========== 3. FIX ALL REMAINING public ROLE → authenticated ==========
-- Change all INSERT/UPDATE/DELETE policies from TO public to TO authenticated

-- admin_allowed_devices
DROP POLICY IF EXISTS "Only admins can register devices" ON public.admin_allowed_devices;
CREATE POLICY "Only admins can register devices" ON public.admin_allowed_devices
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- admin_logs
DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
CREATE POLICY "No direct admin_logs deletes" ON public.admin_logs FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct admin_logs inserts" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct admin_logs updates" ON public.admin_logs FOR UPDATE TO authenticated USING (false);

-- admin_section_permissions
DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
CREATE POLICY "No direct perm deletes" ON public.admin_section_permissions FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct perm inserts" ON public.admin_section_permissions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct perm updates" ON public.admin_section_permissions FOR UPDATE TO authenticated USING (false);

-- admin_users
DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
CREATE POLICY "No direct admin inserts" ON public.admin_users FOR INSERT TO authenticated WITH CHECK (false);

-- agencies
DROP POLICY IF EXISTS "No direct agency deletes" ON public.agencies;
DROP POLICY IF EXISTS "No direct agency inserts" ON public.agencies;
DROP POLICY IF EXISTS "Users can create own agency or admins can create for anyone" ON public.agencies;
CREATE POLICY "No direct agency deletes" ON public.agencies FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct agency inserts" ON public.agencies FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Users can create own agency or admins" ON public.agencies
  FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id) OR public.is_admin(auth.uid()));

-- agency_diamond_transactions
DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
DROP POLICY IF EXISTS "Agency owners can insert transactions" ON public.agency_diamond_transactions;
CREATE POLICY "No direct agency diamond inserts" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Agency owners can insert transactions" ON public.agency_diamond_transactions
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM agencies WHERE agencies.id = agency_diamond_transactions.agency_id AND agencies.owner_id = auth.uid()));

-- agency_hosts
DROP POLICY IF EXISTS "Users can join agencies" ON public.agency_hosts;
DROP POLICY IF EXISTS "Admins can add hosts to agencies" ON public.agency_hosts;
CREATE POLICY "Users can join agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Admins can add hosts to agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- agency_level_tiers
DROP POLICY IF EXISTS "Admins can insert agency level tiers" ON public.agency_level_tiers;
DROP POLICY IF EXISTS "Only admins can insert agency level tiers" ON public.agency_level_tiers;
DROP POLICY IF EXISTS "Only admins can delete agency level tiers" ON public.agency_level_tiers;
DROP POLICY IF EXISTS "Only admins can update agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Admins manage agency level tiers" ON public.agency_level_tiers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- agency_performance
DROP POLICY IF EXISTS "No direct performance updates" ON public.agency_performance;
CREATE POLICY "No direct performance updates" ON public.agency_performance FOR UPDATE TO authenticated USING (false);

-- agency_withdrawals
DROP POLICY IF EXISTS "Admins can manage all agency withdrawals" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "No direct withdrawal inserts" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "Agency owners can create withdrawal requests" ON public.agency_withdrawals;
CREATE POLICY "Admins can manage all agency withdrawals" ON public.agency_withdrawals FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "No direct withdrawal inserts" ON public.agency_withdrawals FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Agency owners can create withdrawal requests" ON public.agency_withdrawals
  FOR INSERT TO authenticated WITH CHECK (agency_id IN (SELECT agencies.id FROM agencies WHERE agencies.owner_id = auth.uid()));

-- avatar_frames
DROP POLICY IF EXISTS "Admins can manage frames" ON public.avatar_frames;
CREATE POLICY "Admins can manage frames" ON public.avatar_frames FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- banned_devices
DROP POLICY IF EXISTS "Only admins can manage banned devices" ON public.banned_devices;
CREATE POLICY "Only admins can manage banned devices" ON public.banned_devices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- banners
DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
CREATE POLICY "Admins can manage banners" ON public.banners FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- branding_settings
DROP POLICY IF EXISTS "Admins can insert branding settings" ON public.branding_settings;
CREATE POLICY "Admins can insert branding settings" ON public.branding_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- call_events
DROP POLICY IF EXISTS "System can insert call events" ON public.call_events;
CREATE POLICY "System can insert call events" ON public.call_events
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM private_calls WHERE private_calls.id = call_events.call_id AND (private_calls.caller_id = auth.uid() OR private_calls.host_id = auth.uid())));

-- chat_moderation_logs
DROP POLICY IF EXISTS "Only admins can insert moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Only admins can insert moderation logs" ON public.chat_moderation_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- coin_packages
DROP POLICY IF EXISTS "Admins can manage packages" ON public.coin_packages;
DROP POLICY IF EXISTS "No direct coin_package deletes" ON public.coin_packages;
DROP POLICY IF EXISTS "No direct coin_package inserts" ON public.coin_packages;
DROP POLICY IF EXISTS "No direct coin_package updates" ON public.coin_packages;
CREATE POLICY "Admins can manage packages" ON public.coin_packages FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "No direct coin_package deletes" ON public.coin_packages FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct coin_package inserts" ON public.coin_packages FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct coin_package updates" ON public.coin_packages FOR UPDATE TO authenticated USING (false);

-- coin_transfers
DROP POLICY IF EXISTS "Agency owners can create transfers" ON public.coin_transfers;
DROP POLICY IF EXISTS "No direct coin transfer inserts" ON public.coin_transfers;
CREATE POLICY "Agency owners can create transfers" ON public.coin_transfers FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "No direct coin transfer inserts" ON public.coin_transfers FOR INSERT TO authenticated WITH CHECK (false);

-- conversations
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK ((auth.uid() = participant_1) OR (auth.uid() = participant_2));
CREATE POLICY "Users can update own conversations" ON public.conversations FOR UPDATE TO authenticated USING ((auth.uid() = participant_1) OR (auth.uid() = participant_2));

-- currency_rates
DROP POLICY IF EXISTS "Admins can manage currency rates" ON public.currency_rates;
CREATE POLICY "Admins can manage currency rates" ON public.currency_rates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- device_tokens
DROP POLICY IF EXISTS "Service role can access all device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can delete their own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can insert their own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can update their own device tokens" ON public.device_tokens;
CREATE POLICY "Service role can access all device tokens" ON public.device_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can delete their own device tokens" ON public.device_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own device tokens" ON public.device_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own device tokens" ON public.device_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- entry_banners
DROP POLICY IF EXISTS "Admin users can delete entry banners" ON public.entry_banners;
DROP POLICY IF EXISTS "Admin users can insert entry banners" ON public.entry_banners;
DROP POLICY IF EXISTS "Admin users can update entry banners" ON public.entry_banners;
CREATE POLICY "Admin users can delete entry banners" ON public.entry_banners FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));
CREATE POLICY "Admin users can insert entry banners" ON public.entry_banners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));
CREATE POLICY "Admin users can update entry banners" ON public.entry_banners FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));

-- entry_name_bars
DROP POLICY IF EXISTS "Admins can manage entry name bars" ON public.entry_name_bars;
CREATE POLICY "Admins can manage entry name bars" ON public.entry_name_bars FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));

-- face_records
DROP POLICY IF EXISTS "Users can insert their own face record" ON public.face_records;
DROP POLICY IF EXISTS "Users can update their own face record" ON public.face_records;
CREATE POLICY "Users can insert their own face record" ON public.face_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own face record" ON public.face_records FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- face_verification_submissions
DROP POLICY IF EXISTS "Users can create their own submissions" ON public.face_verification_submissions;
CREATE POLICY "Users can create their own submissions" ON public.face_verification_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- followers
DROP POLICY IF EXISTS "Users can follow others" ON public.followers;
DROP POLICY IF EXISTS "Users can unfollow" ON public.followers;
CREATE POLICY "Users can follow others" ON public.followers FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.followers FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- game_bets
DROP POLICY IF EXISTS "Authenticated users can place bets" ON public.game_bets;
CREATE POLICY "Authenticated users can place bets" ON public.game_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- game_players
DROP POLICY IF EXISTS "No direct game player updates" ON public.game_players;
DROP POLICY IF EXISTS "Users can join games" ON public.game_players;
CREATE POLICY "No direct game player updates" ON public.game_players FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Users can join games" ON public.game_players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- game_server_settings
DROP POLICY IF EXISTS "Admins can manage game server settings" ON public.game_server_settings;
CREATE POLICY "Admins can manage game server settings" ON public.game_server_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- game_sessions
DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON public.game_sessions;
CREATE POLICY "Authenticated users can create game sessions" ON public.game_sessions
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM party_rooms WHERE party_rooms.id = game_sessions.room_id AND party_rooms.host_id = auth.uid()));

-- game_transactions
DROP POLICY IF EXISTS "No direct game deletes" ON public.game_transactions;
DROP POLICY IF EXISTS "No direct game inserts" ON public.game_transactions;
DROP POLICY IF EXISTS "No direct game updates" ON public.game_transactions;
DROP POLICY IF EXISTS "Users can insert own game transactions" ON public.game_transactions;
CREATE POLICY "No direct game deletes" ON public.game_transactions FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct game inserts" ON public.game_transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct game updates" ON public.game_transactions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Users can insert own game transactions" ON public.game_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- gift_transaction_logs
DROP POLICY IF EXISTS "Admins can insert gift logs" ON public.gift_transaction_logs;
DROP POLICY IF EXISTS "No direct gift log inserts" ON public.gift_transaction_logs;
CREATE POLICY "Admins can insert gift logs" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "No direct gift log inserts" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (false);

-- gift_transactions
DROP POLICY IF EXISTS "No direct gift deletes" ON public.gift_transactions;
DROP POLICY IF EXISTS "No direct gift inserts" ON public.gift_transactions;
DROP POLICY IF EXISTS "No direct gift updates" ON public.gift_transactions;
DROP POLICY IF EXISTS "Users can send gifts" ON public.gift_transactions;
CREATE POLICY "No direct gift deletes" ON public.gift_transactions FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct gift inserts" ON public.gift_transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct gift updates" ON public.gift_transactions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Users can send gifts" ON public.gift_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- gifts
DROP POLICY IF EXISTS "Admins can delete gifts" ON public.gifts;
DROP POLICY IF EXISTS "Admins can insert gifts" ON public.gifts;
DROP POLICY IF EXISTS "Admins can update gifts" ON public.gifts;
CREATE POLICY "Admins can delete gifts" ON public.gifts FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert gifts" ON public.gifts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update gifts" ON public.gifts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- group_members
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave groups" ON public.group_members FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR EXISTS (SELECT 1 FROM groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid()));

-- group_messages
DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages;
CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK ((EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid())) AND (auth.uid() = sender_id));

-- groups
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
DROP POLICY IF EXISTS "Owners can delete their groups" ON public.groups;
DROP POLICY IF EXISTS "Owners can update their groups" ON public.groups;
CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their groups" ON public.groups FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can update their groups" ON public.groups FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

-- helper_admin_messages
DROP POLICY IF EXISTS "Helpers can mark their messages as read" ON public.helper_admin_messages;
CREATE POLICY "Helpers can mark their messages as read" ON public.helper_admin_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_admin_messages.helper_id AND topup_helpers.user_id = auth.uid()));

-- helper_assigned_countries
DROP POLICY IF EXISTS "Admins can manage helper country assignments" ON public.helper_assigned_countries;
CREATE POLICY "Admins can manage helper country assignments" ON public.helper_assigned_countries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- helper_country_payment_methods
DROP POLICY IF EXISTS "Admins can manage all helper payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can delete their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can insert their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can update their own payment methods" ON public.helper_country_payment_methods;
CREATE POLICY "Admins can manage all helper payment methods" ON public.helper_country_payment_methods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Helpers can delete their own payment methods" ON public.helper_country_payment_methods FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_country_payment_methods.helper_id AND topup_helpers.user_id = auth.uid()));
CREATE POLICY "Helpers can insert their own payment methods" ON public.helper_country_payment_methods FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_country_payment_methods.helper_id AND topup_helpers.user_id = auth.uid() AND topup_helpers.trader_level = 5 AND topup_helpers.payroll_enabled = true));
CREATE POLICY "Helpers can update their own payment methods" ON public.helper_country_payment_methods FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_country_payment_methods.helper_id AND topup_helpers.user_id = auth.uid()));

-- helper_diamond_packages
DROP POLICY IF EXISTS "Admins can manage helper diamond packages" ON public.helper_diamond_packages;
CREATE POLICY "Admins can manage helper diamond packages" ON public.helper_diamond_packages FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- helper_level_config
DROP POLICY IF EXISTS "Admins can manage helper level config" ON public.helper_level_config;
CREATE POLICY "Admins can manage helper level config" ON public.helper_level_config FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- helper_message_replies
DROP POLICY IF EXISTS "Admins can create replies" ON public.helper_message_replies;
DROP POLICY IF EXISTS "Admins can update replies" ON public.helper_message_replies;
DROP POLICY IF EXISTS "Helpers can create replies" ON public.helper_message_replies;
CREATE POLICY "Admins can create replies" ON public.helper_message_replies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Admins can update replies" ON public.helper_message_replies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Helpers can create replies" ON public.helper_message_replies FOR INSERT TO authenticated
  WITH CHECK (sender_type = 'helper' AND sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM helper_admin_messages ham JOIN topup_helpers th ON ham.helper_id = th.id
    WHERE ham.id = helper_message_replies.message_id AND th.user_id = auth.uid()));

-- helper_notifications
DROP POLICY IF EXISTS "Admins can insert helper notifications" ON public.helper_notifications;
DROP POLICY IF EXISTS "Admins can manage all helper notifications" ON public.helper_notifications;
DROP POLICY IF EXISTS "Helpers can update own notifications" ON public.helper_notifications;
DROP POLICY IF EXISTS "Only admins can insert helper notifications" ON public.helper_notifications;
CREATE POLICY "Admins can manage all helper notifications" ON public.helper_notifications FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Helpers can update own notifications" ON public.helper_notifications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_notifications.helper_id AND topup_helpers.user_id = auth.uid()));

-- helper_orders
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.helper_orders;
DROP POLICY IF EXISTS "Helpers can update their orders" ON public.helper_orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.helper_orders;
CREATE POLICY "Admins can manage all orders" ON public.helper_orders FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Helpers can update their orders" ON public.helper_orders FOR UPDATE TO authenticated
  USING (helper_id IN (SELECT topup_helpers.id FROM topup_helpers WHERE topup_helpers.user_id = auth.uid()));
CREATE POLICY "Users can create orders" ON public.helper_orders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- helper_payment_methods
DROP POLICY IF EXISTS "Helpers can manage own payment methods" ON public.helper_payment_methods;
CREATE POLICY "Helpers can manage own payment methods" ON public.helper_payment_methods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_payment_methods.helper_id AND topup_helpers.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_payment_methods.helper_id AND topup_helpers.user_id = auth.uid()));

-- helper_topup_requests
DROP POLICY IF EXISTS "Helpers can create topup requests" ON public.helper_topup_requests;
CREATE POLICY "Helpers can create topup requests" ON public.helper_topup_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- helper_transactions
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.helper_transactions;
DROP POLICY IF EXISTS "Helpers can create transactions" ON public.helper_transactions;
CREATE POLICY "Admins can manage transactions" ON public.helper_transactions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Helpers can create transactions" ON public.helper_transactions FOR INSERT TO authenticated
  WITH CHECK (helper_id IN (SELECT topup_helpers.id FROM topup_helpers WHERE topup_helpers.user_id = auth.uid()));

-- helper_upgrade_requests
DROP POLICY IF EXISTS "Admins can update upgrade requests" ON public.helper_upgrade_requests;
DROP POLICY IF EXISTS "Helpers can create upgrade requests" ON public.helper_upgrade_requests;
CREATE POLICY "Admins can update upgrade requests" ON public.helper_upgrade_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Helpers can create upgrade requests" ON public.helper_upgrade_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- helper_withdrawal_requests
DROP POLICY IF EXISTS "Admins can manage all helper withdrawals" ON public.helper_withdrawal_requests;
DROP POLICY IF EXISTS "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests;
CREATE POLICY "Admins can manage all helper withdrawals" ON public.helper_withdrawal_requests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers WHERE topup_helpers.id = helper_withdrawal_requests.helper_id AND topup_helpers.user_id = auth.uid()));

-- host_applications
DROP POLICY IF EXISTS "Users can insert their own application" ON public.host_applications;
CREATE POLICY "Users can insert their own application" ON public.host_applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- host_contact_violations
DROP POLICY IF EXISTS "Admins can manage contact violations" ON public.host_contact_violations;
CREATE POLICY "Admins can manage contact violations" ON public.host_contact_violations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- leaderboard_reward_config
DROP POLICY IF EXISTS "Admins can manage reward config" ON public.leaderboard_reward_config;
CREATE POLICY "Admins can manage reward config" ON public.leaderboard_reward_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- leaderboard_reward_history
DROP POLICY IF EXISTS "Admins can insert reward history" ON public.leaderboard_reward_history;
CREATE POLICY "Admins can insert reward history" ON public.leaderboard_reward_history FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- level_animations
DROP POLICY IF EXISTS "Admins can manage animations" ON public.level_animations;
CREATE POLICY "Admins can manage animations" ON public.level_animations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- level_privileges
DROP POLICY IF EXISTS "Admins can manage privileges" ON public.level_privileges;
CREATE POLICY "Admins can manage privileges" ON public.level_privileges FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- live_bans
DROP POLICY IF EXISTS "Admins can manage all bans" ON public.live_bans;
CREATE POLICY "Admins can manage all bans" ON public.live_bans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- live_game_bets
DROP POLICY IF EXISTS "No direct bet inserts" ON public.live_game_bets;
DROP POLICY IF EXISTS "No direct bet updates" ON public.live_game_bets;
DROP POLICY IF EXISTS "Users can place live game bets" ON public.live_game_bets;
CREATE POLICY "No direct bet inserts" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct bet updates" ON public.live_game_bets FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Users can place live game bets" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- live_game_rounds
DROP POLICY IF EXISTS "No direct game round inserts" ON public.live_game_rounds;
DROP POLICY IF EXISTS "No direct game round updates" ON public.live_game_rounds;
CREATE POLICY "No direct game round inserts" ON public.live_game_rounds FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct game round updates" ON public.live_game_rounds FOR UPDATE TO authenticated USING (false);

-- live_moderation_settings
DROP POLICY IF EXISTS "Admins can update moderation settings" ON public.live_moderation_settings;
CREATE POLICY "Admins can update moderation settings" ON public.live_moderation_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- live_streams
DROP POLICY IF EXISTS "Admins can delete any stream" ON public.live_streams;
DROP POLICY IF EXISTS "Admins can update any stream" ON public.live_streams;
DROP POLICY IF EXISTS "Hosts can create streams" ON public.live_streams;
DROP POLICY IF EXISTS "Hosts can update own streams" ON public.live_streams;
CREATE POLICY "Admins can delete any stream" ON public.live_streams FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));
CREATE POLICY "Admins can update any stream" ON public.live_streams FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));
CREATE POLICY "Hosts can create streams" ON public.live_streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can update own streams" ON public.live_streams FOR UPDATE TO authenticated USING (auth.uid() = host_id);

-- live_violations
DROP POLICY IF EXISTS "Admins can manage all violations" ON public.live_violations;
CREATE POLICY "Admins can manage all violations" ON public.live_violations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- messages
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = sender_id) AND is_conversation_participant(auth.uid(), conversation_id));
CREATE POLICY "Users can update messages in their conversations" ON public.messages FOR UPDATE TO authenticated
  USING (is_conversation_participant(auth.uid(), conversation_id))
  WITH CHECK (is_conversation_participant(auth.uid(), conversation_id));

-- new_host_live_bonus_progress
DROP POLICY IF EXISTS "System can manage bonus progress" ON public.new_host_live_bonus_progress;
CREATE POLICY "System can manage bonus progress" ON public.new_host_live_bonus_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- new_host_live_bonus_settings
DROP POLICY IF EXISTS "Admin can manage bonus settings" ON public.new_host_live_bonus_settings;
CREATE POLICY "Admin can manage bonus settings" ON public.new_host_live_bonus_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- notifications
DROP POLICY IF EXISTS "No direct notification inserts" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "No direct notification inserts" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- party_room_backgrounds
DROP POLICY IF EXISTS "Admin users can delete party room backgrounds" ON public.party_room_backgrounds;
DROP POLICY IF EXISTS "Admin users can insert party room backgrounds" ON public.party_room_backgrounds;
DROP POLICY IF EXISTS "Admin users can update party room backgrounds" ON public.party_room_backgrounds;
CREATE POLICY "Admin users can delete party room backgrounds" ON public.party_room_backgrounds FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT au.user_id FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));
CREATE POLICY "Admin users can insert party room backgrounds" ON public.party_room_backgrounds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT au.user_id FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));
CREATE POLICY "Admin users can update party room backgrounds" ON public.party_room_backgrounds FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT au.user_id FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));

-- party_room_messages
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.party_room_messages;
CREATE POLICY "Authenticated users can send messages" ON public.party_room_messages FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = sender_id) AND ((EXISTS (SELECT 1 FROM party_room_participants WHERE party_room_participants.room_id = party_room_messages.room_id AND party_room_participants.user_id = auth.uid() AND party_room_participants.left_at IS NULL)) OR (EXISTS (SELECT 1 FROM party_rooms WHERE party_rooms.id = party_room_messages.room_id AND party_rooms.host_id = auth.uid()))));

-- party_room_participants
DROP POLICY IF EXISTS "Hosts can update participants in their rooms" ON public.party_room_participants;
DROP POLICY IF EXISTS "Users can join rooms" ON public.party_room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON public.party_room_participants;
CREATE POLICY "Hosts can update participants in their rooms" ON public.party_room_participants FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM party_rooms WHERE party_rooms.id = party_room_participants.room_id AND party_rooms.host_id = auth.uid() AND party_rooms.is_active = true));
CREATE POLICY "Users can join rooms" ON public.party_room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.party_room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- party_rooms
DROP POLICY IF EXISTS "Admin users can update any party room" ON public.party_rooms;
DROP POLICY IF EXISTS "Authenticated users can create party rooms" ON public.party_rooms;
DROP POLICY IF EXISTS "Hosts can delete their rooms" ON public.party_rooms;
DROP POLICY IF EXISTS "Hosts can update their rooms" ON public.party_rooms;
CREATE POLICY "Admin users can update any party room" ON public.party_rooms FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT au.user_id FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));
CREATE POLICY "Authenticated users can create party rooms" ON public.party_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can delete their rooms" ON public.party_rooms FOR DELETE TO authenticated USING (auth.uid() = host_id);
CREATE POLICY "Hosts can update their rooms" ON public.party_rooms FOR UPDATE TO authenticated USING (auth.uid() = host_id);

-- password_reset_otps
DROP POLICY IF EXISTS "Deny all direct access to OTPs" ON public.password_reset_otps;
CREATE POLICY "Deny all direct access to OTPs" ON public.password_reset_otps FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- payment_gateways
DROP POLICY IF EXISTS "Admins can manage payment gateways" ON public.payment_gateways;
CREATE POLICY "Admins can manage payment gateways" ON public.payment_gateways FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- payment_transactions
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.payment_transactions;
CREATE POLICY "Users can create their own transactions" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- payroll_requests (keep specific ones)
DROP POLICY IF EXISTS "Agency owners can create payroll requests" ON public.payroll_requests;
DROP POLICY IF EXISTS "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests;
CREATE POLICY "Agency owners can create payroll requests" ON public.payroll_requests
  FOR INSERT TO authenticated WITH CHECK (agency_id IN (SELECT agencies.id FROM agencies WHERE agencies.owner_id = auth.uid()));
CREATE POLICY "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests FOR UPDATE TO authenticated
  USING (trader_id IN (SELECT topup_helpers.id FROM topup_helpers WHERE topup_helpers.user_id = auth.uid() AND topup_helpers.trader_level = 5));

-- pk_battle_gifts
DROP POLICY IF EXISTS "Authenticated users can send PK gifts" ON public.pk_battle_gifts;
CREATE POLICY "Authenticated users can send PK gifts" ON public.pk_battle_gifts FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- pk_battles
DROP POLICY IF EXISTS "Authenticated users can create PK battles" ON public.pk_battles;
CREATE POLICY "Authenticated users can create PK battles" ON public.pk_battles FOR INSERT TO authenticated WITH CHECK (auth.uid() = challenger_id);

-- pk_participants
DROP POLICY IF EXISTS "Users can join PK competitions" ON public.pk_participants;
CREATE POLICY "Users can join PK competitions" ON public.pk_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- pk_reward_banners
DROP POLICY IF EXISTS "Admins can manage PK banners" ON public.pk_reward_banners;
CREATE POLICY "Admins can manage PK banners" ON public.pk_reward_banners FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- popup_event_banners
DROP POLICY IF EXISTS "Admins can manage popup banners" ON public.popup_event_banners;
CREATE POLICY "Admins can manage popup banners" ON public.popup_event_banners FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- poster_images
DROP POLICY IF EXISTS "Users can delete their own poster images" ON public.poster_images;
DROP POLICY IF EXISTS "Users can insert their own poster images" ON public.poster_images;
DROP POLICY IF EXISTS "Users can update their own poster images" ON public.poster_images;
CREATE POLICY "Users can delete their own poster images" ON public.poster_images FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own poster images" ON public.poster_images FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own poster images" ON public.poster_images FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- private_call_security_logs
DROP POLICY IF EXISTS "No direct security log inserts" ON public.private_call_security_logs;
CREATE POLICY "No direct security log inserts" ON public.private_call_security_logs FOR INSERT TO authenticated WITH CHECK (false);

-- private_calls
DROP POLICY IF EXISTS "Users can create calls" ON public.private_calls;
CREATE POLICY "Users can create calls" ON public.private_calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);

-- profiles
DROP POLICY IF EXISTS "No direct profile deletes" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "No direct profile deletes" ON public.profiles FOR DELETE TO authenticated USING (false);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- recharge_transactions
DROP POLICY IF EXISTS "No direct recharge deletes" ON public.recharge_transactions;
DROP POLICY IF EXISTS "No direct recharge inserts" ON public.recharge_transactions;
DROP POLICY IF EXISTS "No direct recharge updates" ON public.recharge_transactions;
DROP POLICY IF EXISTS "Users can create transactions" ON public.recharge_transactions;
CREATE POLICY "No direct recharge deletes" ON public.recharge_transactions FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct recharge inserts" ON public.recharge_transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct recharge updates" ON public.recharge_transactions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Users can create transactions" ON public.recharge_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- reel_comments
DROP POLICY IF EXISTS "Authenticated users can comment" ON public.reel_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.reel_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.reel_comments;
CREATE POLICY "Authenticated users can comment" ON public.reel_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comments" ON public.reel_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments" ON public.reel_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- reel_likes
DROP POLICY IF EXISTS "Authenticated users can like reels" ON public.reel_likes;
DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.reel_likes;
CREATE POLICY "Authenticated users can like reels" ON public.reel_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike their own likes" ON public.reel_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- reel_reports
DROP POLICY IF EXISTS "Authenticated users can report reels" ON public.reel_reports;
CREATE POLICY "Authenticated users can report reels" ON public.reel_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- reel_shares
DROP POLICY IF EXISTS "Authenticated users can share reels" ON public.reel_shares;
CREATE POLICY "Authenticated users can share reels" ON public.reel_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- reels
DROP POLICY IF EXISTS "Hosts can create reels" ON public.reels;
DROP POLICY IF EXISTS "Users can delete own reels" ON public.reels;
DROP POLICY IF EXISTS "Users can delete their own reels" ON public.reels;
DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;
CREATE POLICY "Hosts can create reels" ON public.reels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reels" ON public.reels FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own reels" ON public.reels FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- role_frames
DROP POLICY IF EXISTS "Admins can manage role frames" ON public.role_frames;
CREATE POLICY "Admins can manage role frames" ON public.role_frames FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- room_welcome_messages
DROP POLICY IF EXISTS "Admins can manage welcome messages" ON public.room_welcome_messages;
CREATE POLICY "Admins can manage welcome messages" ON public.room_welcome_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.is_active = true));

-- roulette_bets
DROP POLICY IF EXISTS "Users can place their own bets" ON public.roulette_bets;
CREATE POLICY "Users can place their own bets" ON public.roulette_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- roulette_sessions
DROP POLICY IF EXISTS "No direct roulette session creation" ON public.roulette_sessions;
DROP POLICY IF EXISTS "No direct roulette session updates" ON public.roulette_sessions;
CREATE POLICY "No direct roulette session creation" ON public.roulette_sessions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct roulette session updates" ON public.roulette_sessions FOR UPDATE TO authenticated USING (false);

-- seat_invitations
DROP POLICY IF EXISTS "Hosts can create seat invitations" ON public.seat_invitations;
DROP POLICY IF EXISTS "Hosts can delete their invitations" ON public.seat_invitations;
DROP POLICY IF EXISTS "Users can update their own invitations" ON public.seat_invitations;
CREATE POLICY "Hosts can create seat invitations" ON public.seat_invitations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM party_rooms WHERE party_rooms.id = seat_invitations.room_id AND party_rooms.host_id = auth.uid()));
CREATE POLICY "Hosts can delete their invitations" ON public.seat_invitations FOR DELETE TO authenticated USING (host_id = auth.uid());
CREATE POLICY "Users can update their own invitations" ON public.seat_invitations FOR UPDATE TO authenticated USING ((invitee_id = auth.uid()) OR (host_id = auth.uid()));

-- seat_requests
DROP POLICY IF EXISTS "Users can create their own seat requests" ON public.seat_requests;
DROP POLICY IF EXISTS "Users can delete their own requests" ON public.seat_requests;
DROP POLICY IF EXISTS "Users can update their own requests" ON public.seat_requests;
CREATE POLICY "Users can create their own seat requests" ON public.seat_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can delete their own requests" ON public.seat_requests FOR DELETE TO authenticated USING (auth.uid() = requester_id);
CREATE POLICY "Users can update their own requests" ON public.seat_requests FOR UPDATE TO authenticated
  USING ((auth.uid() = requester_id) OR (EXISTS (SELECT 1 FROM party_rooms WHERE party_rooms.id = seat_requests.room_id AND party_rooms.host_id = auth.uid())));

-- stream_chat
DROP POLICY IF EXISTS "Authenticated users can chat" ON public.stream_chat;
CREATE POLICY "Authenticated users can chat" ON public.stream_chat FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- stream_recordings
DROP POLICY IF EXISTS "No direct recording inserts" ON public.stream_recordings;
DROP POLICY IF EXISTS "No direct recording updates" ON public.stream_recordings;
CREATE POLICY "No direct recording inserts" ON public.stream_recordings FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct recording updates" ON public.stream_recordings FOR UPDATE TO authenticated USING (false);

-- stream_viewers
DROP POLICY IF EXISTS "Users can join streams" ON public.stream_viewers;
DROP POLICY IF EXISTS "Users can leave streams" ON public.stream_viewers;
DROP POLICY IF EXISTS "Users can remove themselves" ON public.stream_viewers;
CREATE POLICY "Users can join streams" ON public.stream_viewers FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);
CREATE POLICY "Users can leave streams" ON public.stream_viewers FOR UPDATE TO authenticated USING (auth.uid() = viewer_id);
CREATE POLICY "Users can remove themselves" ON public.stream_viewers FOR DELETE TO authenticated USING (auth.uid() = viewer_id);

-- sub_agents
DROP POLICY IF EXISTS "Agency owners can manage sub-agents" ON public.sub_agents;
CREATE POLICY "Agency owners can manage sub-agents" ON public.sub_agents FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT agencies.owner_id FROM agencies WHERE agencies.id = sub_agents.agency_id))
  WITH CHECK (auth.uid() IN (SELECT agencies.owner_id FROM agencies WHERE agencies.id = sub_agents.agency_id));

-- subscription_orders
DROP POLICY IF EXISTS "Only admins can create orders" ON public.subscription_orders;
CREATE POLICY "Only admins can create orders" ON public.subscription_orders FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- support_messages
DROP POLICY IF EXISTS "Admins can send messages to any ticket" ON public.support_messages;
DROP POLICY IF EXISTS "Admins can update messages" ON public.support_messages;
DROP POLICY IF EXISTS "Users can send messages to their tickets" ON public.support_messages;
CREATE POLICY "Admins can send messages to any ticket" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update messages" ON public.support_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can send messages to their tickets" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = sender_id) AND EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = support_messages.ticket_id AND support_tickets.user_id = auth.uid()));

-- support_tickets
DROP POLICY IF EXISTS "Admins can update all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can create tickets" ON public.support_tickets;
CREATE POLICY "Admins can update all tickets" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- system_error_logs
DROP POLICY IF EXISTS "No direct error log deletes" ON public.system_error_logs;
DROP POLICY IF EXISTS "No direct error log inserts" ON public.system_error_logs;
DROP POLICY IF EXISTS "No direct error log updates" ON public.system_error_logs;
CREATE POLICY "No direct error log deletes" ON public.system_error_logs FOR DELETE TO authenticated USING (false);
CREATE POLICY "No direct error log inserts" ON public.system_error_logs FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct error log updates" ON public.system_error_logs FOR UPDATE TO authenticated USING (false);

-- topup_helpers
DROP POLICY IF EXISTS "Admins can manage helpers" ON public.topup_helpers;
CREATE POLICY "Admins can manage helpers" ON public.topup_helpers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- topup_payment_methods
DROP POLICY IF EXISTS "Only admins can delete payment methods" ON public.topup_payment_methods;
DROP POLICY IF EXISTS "Only admins can insert payment methods" ON public.topup_payment_methods;
DROP POLICY IF EXISTS "Only admins can update payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can delete payment methods" ON public.topup_payment_methods FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Only admins can insert payment methods" ON public.topup_payment_methods FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Only admins can update payment methods" ON public.topup_payment_methods FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- trader_level_purchases
DROP POLICY IF EXISTS "Traders can create level purchases" ON public.trader_level_purchases;
CREATE POLICY "Traders can create level purchases" ON public.trader_level_purchases FOR INSERT TO authenticated
  WITH CHECK (trader_id IN (SELECT topup_helpers.id FROM topup_helpers WHERE topup_helpers.user_id = auth.uid()));

-- trader_level_tiers
DROP POLICY IF EXISTS "Admins can delete trader level tiers" ON public.trader_level_tiers;
DROP POLICY IF EXISTS "Admins can insert trader level tiers" ON public.trader_level_tiers;
DROP POLICY IF EXISTS "Admins can update trader level tiers" ON public.trader_level_tiers;
CREATE POLICY "Admins can delete trader level tiers" ON public.trader_level_tiers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert trader level tiers" ON public.trader_level_tiers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update trader level tiers" ON public.trader_level_tiers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_beans_exchange_history
DROP POLICY IF EXISTS "Users can create own exchanges" ON public.user_beans_exchange_history;
CREATE POLICY "Users can create own exchanges" ON public.user_beans_exchange_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- user_beans_exchange_tiers
DROP POLICY IF EXISTS "Admins can manage exchange tiers" ON public.user_beans_exchange_tiers;
CREATE POLICY "Admins can manage exchange tiers" ON public.user_beans_exchange_tiers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- user_entry_banners
DROP POLICY IF EXISTS "Users can acquire entry banners" ON public.user_entry_banners;
CREATE POLICY "Users can acquire entry banners" ON public.user_entry_banners FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- user_level_tiers
DROP POLICY IF EXISTS "Admins can delete user level tiers" ON public.user_level_tiers;
DROP POLICY IF EXISTS "Admins can insert user level tiers" ON public.user_level_tiers;
DROP POLICY IF EXISTS "Admins can update user level tiers" ON public.user_level_tiers;
CREATE POLICY "Admins can delete user level tiers" ON public.user_level_tiers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert user level tiers" ON public.user_level_tiers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update user level tiers" ON public.user_level_tiers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_purchased_backgrounds
DROP POLICY IF EXISTS "Users can insert their own purchased backgrounds" ON public.user_purchased_backgrounds;
CREATE POLICY "Users can insert their own purchased backgrounds" ON public.user_purchased_backgrounds FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- user_purchases
DROP POLICY IF EXISTS "Users can create purchases" ON public.user_purchases;
DROP POLICY IF EXISTS "Users can update own purchases" ON public.user_purchases;
CREATE POLICY "Users can create purchases" ON public.user_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own purchases" ON public.user_purchases FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- user_role_frames
DROP POLICY IF EXISTS "Admins can manage all role frame assignments" ON public.user_role_frames;
CREATE POLICY "Admins can manage all role frame assignments" ON public.user_role_frames FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- user_vip_subscriptions
DROP POLICY IF EXISTS "Users can insert their own VIP subscriptions" ON public.user_vip_subscriptions;
DROP POLICY IF EXISTS "Users can update their own VIP subscriptions" ON public.user_vip_subscriptions;
CREATE POLICY "Users can insert their own VIP subscriptions" ON public.user_vip_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own VIP subscriptions" ON public.user_vip_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ========== 4. FIX SELECT POLICIES that should require auth ==========

-- Fix SELECT policies on admin tables that use public role
DROP POLICY IF EXISTS "Admins can view all agencies" ON public.agencies;
CREATE POLICY "Admins can view all agencies" ON public.agencies FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency owners can view their commission history" ON public.agency_commission_history;
CREATE POLICY "Agency owners can view their commission history" ON public.agency_commission_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM agencies WHERE agencies.id = agency_commission_history.agency_id AND agencies.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency owners can view their transactions" ON public.agency_diamond_transactions;
CREATE POLICY "Agency owners can view their transactions" ON public.agency_diamond_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM agencies WHERE agencies.id = agency_diamond_transactions.agency_id AND agencies.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency owners can view their transfers" ON public.agency_earnings_transfers;
DROP POLICY IF EXISTS "Hosts can view their own transfers" ON public.agency_earnings_transfers;
CREATE POLICY "Agency owners can view their transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM agencies WHERE agencies.id = agency_earnings_transfers.agency_id AND agencies.owner_id = auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "Hosts can view their own transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING (host_id = auth.uid());

DROP POLICY IF EXISTS "Agency owners can view their hosts" ON public.agency_hosts;
CREATE POLICY "Agency owners can view their hosts" ON public.agency_hosts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM agencies WHERE agencies.id = agency_hosts.agency_id AND agencies.owner_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency owners can view their withdrawals" ON public.agency_withdrawals;
CREATE POLICY "Agency owners can view their withdrawals" ON public.agency_withdrawals FOR SELECT TO authenticated
  USING (agency_id IN (SELECT agencies.id FROM agencies WHERE agencies.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Call participants can view events" ON public.call_events;
CREATE POLICY "Call participants can view events" ON public.call_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM private_calls WHERE private_calls.id = call_events.call_id AND (private_calls.caller_id = auth.uid() OR private_calls.host_id = auth.uid())));

DROP POLICY IF EXISTS "Admins can view all moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Admins can view all moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- agency_withdrawals helper views
DROP POLICY IF EXISTS "Level 5 helpers can view agency withdrawals for assigned countr" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "Level 5 helpers can view all pending withdrawals" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "Level 5 helpers can process agency withdrawals for assigned cou" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "Level 5 helpers can update withdrawals they claim" ON public.agency_withdrawals;
CREATE POLICY "Level 5 helpers can view agency withdrawals" ON public.agency_withdrawals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers th JOIN helper_assigned_countries hac ON hac.helper_id = th.id
    WHERE th.user_id = auth.uid() AND th.trader_level = 5 AND th.payroll_enabled = true AND th.is_active = true AND hac.country_code = agency_withdrawals.country_code AND hac.is_active = true));
CREATE POLICY "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM topup_helpers th JOIN helper_assigned_countries hac ON hac.helper_id = th.id
    WHERE th.user_id = auth.uid() AND th.trader_level = 5 AND th.payroll_enabled = true AND th.is_active = true AND hac.country_code = agency_withdrawals.country_code AND hac.is_active = true));
