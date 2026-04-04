DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
CREATE POLICY "No direct perm updates" ON public.admin_section_permissions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct profile deletes" ON public.profiles;
CREATE POLICY "No direct profile deletes" ON public.profiles FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct recharge deletes" ON public.recharge_transactions;
CREATE POLICY "No direct recharge deletes" ON public.recharge_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct recharge updates" ON public.recharge_transactions;
CREATE POLICY "No direct recharge updates" ON public.recharge_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct recording inserts" ON public.stream_recordings;
CREATE POLICY "No direct recording inserts" ON public.stream_recordings FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct recording updates" ON public.stream_recordings;
CREATE POLICY "No direct recording updates" ON public.stream_recordings FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct roulette bet inserts" ON public.roulette_bets;
CREATE POLICY "No direct roulette bet inserts" ON public.roulette_bets FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct roulette session creation" ON public.roulette_sessions;
CREATE POLICY "No direct roulette session creation" ON public.roulette_sessions FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct roulette session updates" ON public.roulette_sessions;
CREATE POLICY "No direct roulette session updates" ON public.roulette_sessions FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct security log inserts" ON public.private_call_security_logs;
CREATE POLICY "No direct security log inserts" ON public.private_call_security_logs FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No public access to admin_login_otps" ON public.admin_login_otps;
CREATE POLICY "No public access to admin_login_otps" ON public.admin_login_otps TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No public access to rate_limit_attempts" ON public.rate_limit_attempts;
CREATE POLICY "No public access to rate_limit_attempts" ON public.rate_limit_attempts TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Only admins can create orders" ON public.subscription_orders;
CREATE POLICY "Only admins can create orders" ON public.subscription_orders FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can delete allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can delete allowed links" ON public.allowed_external_links FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Only admins can delete payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can delete payment methods" ON public.topup_payment_methods FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can insert allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can insert allowed links" ON public.allowed_external_links FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Only admins can insert game settings" ON public.game_settings;
CREATE POLICY "Only admins can insert game settings" ON public.game_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can insert payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can insert payment methods" ON public.topup_payment_methods FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage agency policies" ON public.agency_policy_settings;
CREATE POLICY "Only admins can manage agency policies" ON public.agency_policy_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage banned devices" ON public.banned_devices;
CREATE POLICY "Only admins can manage banned devices" ON public.banned_devices TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Only admins can manage content" ON public.app_content;
CREATE POLICY "Only admins can manage content" ON public.app_content TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage feature requirements" ON public.feature_level_requirements;
CREATE POLICY "Only admins can manage feature requirements" ON public.feature_level_requirements TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage music" ON public.admin_music_library;
CREATE POLICY "Only admins can manage music" ON public.admin_music_library TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage notices" ON public.admin_notices;
CREATE POLICY "Only admins can manage notices" ON public.admin_notices TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Only admins can manage party room banners" ON public.party_room_banners;
CREATE POLICY "Only admins can manage party room banners" ON public.party_room_banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage payroll_requests" ON public.payroll_requests;
CREATE POLICY "Only admins can manage payroll_requests" ON public.payroll_requests TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage provider games" ON public.provider_games;
CREATE POLICY "Only admins can manage provider games" ON public.provider_games TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage rankings" ON public.agency_rankings;
CREATE POLICY "Only admins can manage rankings" ON public.agency_rankings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage settings" ON public.app_settings;
CREATE POLICY "Only admins can manage settings" ON public.app_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage shop items" ON public.shop_items;
CREATE POLICY "Only admins can manage shop items" ON public.shop_items TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage site_settings" ON public.site_settings;
CREATE POLICY "Only admins can manage site_settings" ON public.site_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage sports" ON public.sports;
CREATE POLICY "Only admins can manage sports" ON public.sports TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage subscription_plans" ON public.subscription_plans;
CREATE POLICY "Only admins can manage subscription_plans" ON public.subscription_plans TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage version settings" ON public.app_version_settings;
CREATE POLICY "Only admins can manage version settings" ON public.app_version_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage youtube_sources" ON public.youtube_sources;
CREATE POLICY "Only admins can manage youtube_sources" ON public.youtube_sources TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can register devices" ON public.admin_allowed_devices;
CREATE POLICY "Only admins can register devices" ON public.admin_allowed_devices FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can update allowed links" ON public.allowed_external_links FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Only admins can update applications" ON public.host_applications;
CREATE POLICY "Only admins can update applications" ON public.host_applications FOR UPDATE TO authenticated USING ((((auth.uid() = user_id) AND (status = 'pending'::text)) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Only admins can update branding" ON public.branding_settings;
CREATE POLICY "Only admins can update branding" ON public.branding_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update game sessions" ON public.game_sessions;
CREATE POLICY "Only admins can update game sessions" ON public.game_sessions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update game settings" ON public.game_settings;
CREATE POLICY "Only admins can update game settings" ON public.game_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update gift logs" ON public.gift_transaction_logs;
CREATE POLICY "Only admins can update gift logs" ON public.gift_transaction_logs FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can update payment methods" ON public.topup_payment_methods FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update submissions" ON public.face_verification_submissions;
CREATE POLICY "Only admins can update submissions" ON public.face_verification_submissions FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR ((auth.uid() = user_id) AND (status = 'pending'::text))));

DROP POLICY IF EXISTS "Only admins can update topup requests" ON public.helper_topup_requests;
CREATE POLICY "Only admins can update topup requests" ON public.helper_topup_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can update transactions" ON public.payment_transactions;
CREATE POLICY "Only admins can update transactions" ON public.payment_transactions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins manage agency hosts" ON public.agency_hosts;
CREATE POLICY "Only admins manage agency hosts" ON public.agency_hosts TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can delete their groups" ON public.groups;
CREATE POLICY "Owners can delete their groups" ON public.groups FOR DELETE TO authenticated USING ((auth.uid() = owner_id));

DROP POLICY IF EXISTS "Owners can manage all admin users" ON public.admin_users;
CREATE POLICY "Owners can manage all admin users" ON public.admin_users TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can manage all devices" ON public.admin_allowed_devices;
CREATE POLICY "Owners can manage all devices" ON public.admin_allowed_devices TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can manage invitations" ON public.admin_invitations;
CREATE POLICY "Owners can manage invitations" ON public.admin_invitations TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can manage permissions" ON public.admin_section_permissions;
CREATE POLICY "Owners can manage permissions" ON public.admin_section_permissions TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can manage sections" ON public.admin_sections;
CREATE POLICY "Owners can manage sections" ON public.admin_sections TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can update own agency stats" ON public.agencies;
CREATE POLICY "Owners can update own agency stats" ON public.agencies FOR UPDATE USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));

DROP POLICY IF EXISTS "Owners can update their groups" ON public.groups;
CREATE POLICY "Owners can update their groups" ON public.groups FOR UPDATE TO authenticated USING ((auth.uid() = owner_id));

DROP POLICY IF EXISTS "Participants can update PK battles" ON public.pk_battles;
CREATE POLICY "Participants can update PK battles" ON public.pk_battles FOR UPDATE TO authenticated USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id)));

DROP POLICY IF EXISTS "Participants can update own calls" ON public.private_calls;
CREATE POLICY "Participants can update own calls" ON public.private_calls FOR UPDATE TO authenticated USING (((auth.uid() = caller_id) OR (auth.uid() = host_id)));

DROP POLICY IF EXISTS "Participants can view room messages" ON public.party_room_messages;
CREATE POLICY "Participants can view room messages" ON public.party_room_messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.party_room_participants
  WHERE ((party_room_participants.room_id = party_room_messages.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))) OR (EXISTS ( SELECT 1
   FROM public.party_rooms
  WHERE ((party_rooms.id = party_room_messages.room_id) AND (party_rooms.host_id = auth.uid()))))));

DROP POLICY IF EXISTS "Party room banners are viewable by everyone" ON public.party_room_banners;
CREATE POLICY "Party room banners are viewable by everyone" ON public.party_room_banners FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Payment methods are viewable by everyone" ON public.payment_methods;
CREATE POLICY "Payment methods are viewable by everyone" ON public.payment_methods FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Public can view active news sources" ON public.news_sources;
CREATE POLICY "Public can view active news sources" ON public.news_sources FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Public can view active youtube sources" ON public.youtube_sources;
CREATE POLICY "Public can view active youtube sources" ON public.youtube_sources FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Service role can manage vpn logs" ON public.vpn_detection_logs;
CREATE POLICY "Service role can manage vpn logs" ON public.vpn_detection_logs TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reconciliation" ON public.payment_reconciliation_log;
CREATE POLICY "Service role full access on reconciliation" ON public.payment_reconciliation_log TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to audit logs" ON public.security_audit_log;
CREATE POLICY "Service role full access to audit logs" ON public.security_audit_log TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to blocked IPs" ON public.blocked_ips;
CREATE POLICY "Service role full access to blocked IPs" ON public.blocked_ips TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages failed logins" ON public.failed_login_attempts;
CREATE POLICY "Service role manages failed logins" ON public.failed_login_attempts TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role manages subscriptions" ON public.user_subscriptions TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Stream viewers can see gifts" ON public.gift_transactions;
CREATE POLICY "Stream viewers can see gifts" ON public.gift_transactions FOR SELECT USING (((stream_id IS NOT NULL) AND (auth.uid() IS NOT NULL)));

DROP POLICY IF EXISTS "Sub-agents can view their commissions" ON public.sub_agent_commissions;
CREATE POLICY "Sub-agents can view their commissions" ON public.sub_agent_commissions FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT sub_agents.user_id
   FROM public.sub_agents
  WHERE (sub_agents.id = sub_agent_commissions.sub_agent_id))));

DROP POLICY IF EXISTS "Sub-agents can view their referrals" ON public.sub_agent_referrals;
CREATE POLICY "Sub-agents can view their referrals" ON public.sub_agent_referrals FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT sub_agents.user_id
   FROM public.sub_agents
  WHERE (sub_agents.id = sub_agent_referrals.sub_agent_id))));

DROP POLICY IF EXISTS "System can insert call events" ON public.call_events;
CREATE POLICY "System can insert call events" ON public.call_events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.private_calls
  WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));

DROP POLICY IF EXISTS "System can manage bonus progress" ON public.new_host_live_bonus_progress;
CREATE POLICY "System can manage bonus progress" ON public.new_host_live_bonus_progress TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "System can manage lockouts" ON public.account_lockouts;
CREATE POLICY "System can manage lockouts" ON public.account_lockouts TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "System can manage rate limits" ON public.rate_limits;
CREATE POLICY "System can manage rate limits" ON public.rate_limits TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Traders can create level purchases" ON public.trader_level_purchases;
CREATE POLICY "Traders can create level purchases" ON public.trader_level_purchases FOR INSERT TO authenticated WITH CHECK ((trader_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Traders can view their own level purchases" ON public.trader_level_purchases;
CREATE POLICY "Traders can view their own level purchases" ON public.trader_level_purchases FOR SELECT TO authenticated USING ((trader_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))));

DROP POLICY IF EXISTS "User level thresholds are publicly readable" ON public.user_level_thresholds;
CREATE POLICY "User level thresholds are publicly readable" ON public.user_level_thresholds FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can acquire entry banners" ON public.user_entry_banners;
CREATE POLICY "Users can acquire entry banners" ON public.user_entry_banners FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can block others" ON public.user_blocks;
CREATE POLICY "Users can block others" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (((blocker_id = auth.uid()) AND (blocked_id <> auth.uid())));

DROP POLICY IF EXISTS "Users can claim first recharge" ON public.first_recharge_claims;
CREATE POLICY "Users can claim first recharge" ON public.first_recharge_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can claim offers" ON public.limited_offer_claims;
CREATE POLICY "Users can claim offers" ON public.limited_offer_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can claim rewards" ON public.invitation_reward_claims;
CREATE POLICY "Users can claim rewards" ON public.invitation_reward_claims FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can claim their returns" ON public.consumption_return_history;
CREATE POLICY "Users can claim their returns" ON public.consumption_return_history FOR UPDATE USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can create calls" ON public.private_calls;
CREATE POLICY "Users can create calls" ON public.private_calls FOR INSERT TO authenticated WITH CHECK ((auth.uid() = caller_id));

DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (((auth.uid() = participant_1) OR (auth.uid() = participant_2)));

DROP POLICY IF EXISTS "Users can create invitations" ON public.user_invitations;
CREATE POLICY "Users can create invitations" ON public.user_invitations FOR INSERT TO authenticated WITH CHECK (((auth.uid() = inviter_id) OR (auth.uid() = invited_user_id)));

DROP POLICY IF EXISTS "Users can create orders" ON public.helper_orders;
CREATE POLICY "Users can create orders" ON public.helper_orders FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create own agency or admins" ON public.agencies;
CREATE POLICY "Users can create own agency or admins" ON public.agencies FOR INSERT TO authenticated WITH CHECK (((auth.uid() = owner_id) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Users can create own exchanges" ON public.user_beans_exchange_history;
CREATE POLICY "Users can create own exchanges" ON public.user_beans_exchange_history FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can create own requests" ON public.host_conversion_requests;
CREATE POLICY "Users can create own requests" ON public.host_conversion_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can create purchases" ON public.user_purchases;
CREATE POLICY "Users can create purchases" ON public.user_purchases FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can create reports" ON public.user_reports;
CREATE POLICY "Users can create reports" ON public.user_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));

DROP POLICY IF EXISTS "Users can create their own seat requests" ON public.seat_requests;
CREATE POLICY "Users can create their own seat requests" ON public.seat_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = requester_id));

DROP POLICY IF EXISTS "Users can create their own submissions" ON public.face_verification_submissions;
CREATE POLICY "Users can create their own submissions" ON public.face_verification_submissions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can create their own transactions" ON public.payment_transactions;
CREATE POLICY "Users can create their own transactions" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create tickets" ON public.support_tickets;
CREATE POLICY "Users can create tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can create transactions" ON public.recharge_transactions;
CREATE POLICY "Users can create transactions" ON public.recharge_transactions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can delete own reels" ON public.reels;
CREATE POLICY "Users can delete own reels" ON public.reels FOR DELETE USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))));

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.reel_comments;
CREATE POLICY "Users can delete their own comments" ON public.reel_comments FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can delete their own poster images" ON public.poster_images;
CREATE POLICY "Users can delete their own poster images" ON public.poster_images FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can delete their own requests" ON public.seat_requests;
CREATE POLICY "Users can delete their own requests" ON public.seat_requests FOR DELETE TO authenticated USING ((auth.uid() = requester_id));

DROP POLICY IF EXISTS "Users can follow others" ON public.followers;
CREATE POLICY "Users can follow others" ON public.followers FOR INSERT TO authenticated WITH CHECK ((auth.uid() = follower_id));

DROP POLICY IF EXISTS "Users can insert own claims" ON public.daily_login_claims;
CREATE POLICY "Users can insert own claims" ON public.daily_login_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own encryption keys" ON public.conversation_encryption_keys;
CREATE POLICY "Users can insert own encryption keys" ON public.conversation_encryption_keys FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert own face violations" ON public.live_face_violations;
CREATE POLICY "Users can insert own face violations" ON public.live_face_violations FOR INSERT WITH CHECK ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can insert own session logs" ON public.session_security_logs;
CREATE POLICY "Users can insert own session logs" ON public.session_security_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert their own VIP subscriptions" ON public.user_vip_subscriptions;
CREATE POLICY "Users can insert their own VIP subscriptions" ON public.user_vip_subscriptions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert their own application" ON public.host_applications;
CREATE POLICY "Users can insert their own application" ON public.host_applications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert their own face record" ON public.face_records;
CREATE POLICY "Users can insert their own face record" ON public.face_records FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert their own poster images" ON public.poster_images;
CREATE POLICY "Users can insert their own poster images" ON public.poster_images FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can insert their own purchased backgrounds" ON public.user_purchased_backgrounds;
CREATE POLICY "Users can insert their own purchased backgrounds" ON public.user_purchased_backgrounds FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can join PK competitions" ON public.pk_participants;
CREATE POLICY "Users can join PK competitions" ON public.pk_participants FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can join agencies" ON public.agency_hosts;
CREATE POLICY "Users can join agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Users can join games" ON public.game_players;
CREATE POLICY "Users can join games" ON public.game_players FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can join rooms" ON public.party_room_participants;
CREATE POLICY "Users can join rooms" ON public.party_room_participants FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can join streams" ON public.stream_viewers;
CREATE POLICY "Users can join streams" ON public.stream_viewers FOR INSERT TO authenticated WITH CHECK ((auth.uid() = viewer_id));

DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
CREATE POLICY "Users can leave groups" ON public.group_members FOR DELETE TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND (g.owner_id = auth.uid()))))));

DROP POLICY IF EXISTS "Users can leave rooms" ON public.party_room_participants;
CREATE POLICY "Users can leave rooms" ON public.party_room_participants FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can leave streams" ON public.stream_viewers;
CREATE POLICY "Users can leave streams" ON public.stream_viewers FOR UPDATE TO authenticated USING ((auth.uid() = viewer_id));

DROP POLICY IF EXISTS "Users can manage own streak" ON public.user_login_streaks;
CREATE POLICY "Users can manage own streak" ON public.user_login_streaks USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can place live game bets" ON public.live_game_bets;
CREATE POLICY "Users can place live game bets" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read active notices" ON public.admin_notices;
CREATE POLICY "Users can read active notices" ON public.admin_notices FOR SELECT TO authenticated USING ((public.is_real_user() AND ((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())))));

DROP POLICY IF EXISTS "Users can read own bonus progress" ON public.new_host_live_bonus_progress;
CREATE POLICY "Users can read own bonus progress" ON public.new_host_live_bonus_progress FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read own cashback history" ON public.consumption_return_history;
CREATE POLICY "Users can read own cashback history" ON public.consumption_return_history FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read own claims" ON public.daily_login_claims;
CREATE POLICY "Users can read own claims" ON public.daily_login_claims FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read own first recharge" ON public.first_recharge_claims;
CREATE POLICY "Users can read own first recharge" ON public.first_recharge_claims FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read own sent gifts" ON public.gift_transactions;
CREATE POLICY "Users can read own sent gifts" ON public.gift_transactions FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));

DROP POLICY IF EXISTS "Users can read own streak" ON public.user_login_streaks;
CREATE POLICY "Users can read own streak" ON public.user_login_streaks FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can remove themselves" ON public.stream_viewers;
CREATE POLICY "Users can remove themselves" ON public.stream_viewers FOR DELETE TO authenticated USING ((auth.uid() = viewer_id));

DROP POLICY IF EXISTS "Users can see their own calls" ON public.private_calls;
CREATE POLICY "Users can see their own calls" ON public.private_calls FOR SELECT TO authenticated USING (((auth.uid() = caller_id) OR (auth.uid() = host_id)));

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND public.is_conversation_participant(auth.uid(), conversation_id)));

DROP POLICY IF EXISTS "Users can send messages to their tickets" ON public.support_messages;
CREATE POLICY "Users can send messages to their tickets" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Users can submit helper applications" ON public.helper_applications;
CREATE POLICY "Users can submit helper applications" ON public.helper_applications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can submit rating claim" ON public.rating_reward_claims;
CREATE POLICY "Users can submit rating claim" ON public.rating_reward_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can unblock" ON public.user_blocks;
CREATE POLICY "Users can unblock" ON public.user_blocks FOR DELETE TO authenticated USING ((blocker_id = auth.uid()));

DROP POLICY IF EXISTS "Users can unfollow" ON public.followers;
CREATE POLICY "Users can unfollow" ON public.followers FOR DELETE TO authenticated USING ((auth.uid() = follower_id));

DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.reel_likes;
CREATE POLICY "Users can unlike their own likes" ON public.reel_likes FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
CREATE POLICY "Users can update messages in their conversations" ON public.messages FOR UPDATE TO authenticated USING (public.is_conversation_participant(auth.uid(), conversation_id)) WITH CHECK (public.is_conversation_participant(auth.uid(), conversation_id));

DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
CREATE POLICY "Users can update own conversations" ON public.conversations FOR UPDATE TO authenticated USING (((auth.uid() = participant_1) OR (auth.uid() = participant_2)));

DROP POLICY IF EXISTS "Users can update own encryption keys" ON public.conversation_encryption_keys;
CREATE POLICY "Users can update own encryption keys" ON public.conversation_encryption_keys FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own invitations" ON public.user_invitations;
CREATE POLICY "Users can update own invitations" ON public.user_invitations FOR UPDATE TO authenticated USING ((auth.uid() = inviter_id));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((public.is_real_user() AND (auth.uid() = id)));

DROP POLICY IF EXISTS "Users can update own purchases" ON public.user_purchases;
CREATE POLICY "Users can update own purchases" ON public.user_purchases FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update own streak" ON public.user_login_streaks;
CREATE POLICY "Users can update own streak" ON public.user_login_streaks FOR UPDATE USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update read status" ON public.support_messages;
CREATE POLICY "Users can update read status" ON public.support_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Users can update their own VIP subscriptions" ON public.user_vip_subscriptions;
CREATE POLICY "Users can update their own VIP subscriptions" ON public.user_vip_subscriptions FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update their own comments" ON public.reel_comments;
CREATE POLICY "Users can update their own comments" ON public.reel_comments FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update their own face record" ON public.face_records;
CREATE POLICY "Users can update their own face record" ON public.face_records FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update their own invitations" ON public.seat_invitations;
CREATE POLICY "Users can update their own invitations" ON public.seat_invitations FOR UPDATE TO authenticated USING (((invitee_id = auth.uid()) OR (host_id = auth.uid())));

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update their own poster images" ON public.poster_images;
CREATE POLICY "Users can update their own poster images" ON public.poster_images FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;
CREATE POLICY "Users can update their own reels" ON public.reels FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can update their own requests" ON public.seat_requests;
CREATE POLICY "Users can update their own requests" ON public.seat_requests FOR UPDATE TO authenticated USING (((auth.uid() = requester_id) OR (EXISTS ( SELECT 1
   FROM public.party_rooms
  WHERE ((party_rooms.id = seat_requests.room_id) AND (party_rooms.host_id = auth.uid()))))));

DROP POLICY IF EXISTS "Users can upsert own streak" ON public.user_login_streaks;
CREATE POLICY "Users can upsert own streak" ON public.user_login_streaks FOR INSERT WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view agency hosts" ON public.agency_hosts;
CREATE POLICY "Users can view agency hosts" ON public.agency_hosts FOR SELECT TO authenticated USING (((host_id = auth.uid()) OR public.is_admin(auth.uid()) OR public.is_agency_owner(auth.uid(), agency_id)));

DROP POLICY IF EXISTS "Users can view all bets in session" ON public.roulette_bets;
CREATE POLICY "Users can view all bets in session" ON public.roulette_bets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view any poster images" ON public.poster_images;
CREATE POLICY "Users can view any poster images" ON public.poster_images FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view live game bets" ON public.live_game_bets;
CREATE POLICY "Users can view live game bets" ON public.live_game_bets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view messages for their tickets" ON public.support_messages;
CREATE POLICY "Users can view messages for their tickets" ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND ((support_tickets.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT TO authenticated USING (public.is_conversation_participant(auth.uid(), conversation_id));

DROP POLICY IF EXISTS "Users can view own bets" ON public.game_bets;
CREATE POLICY "Users can view own bets" ON public.game_bets FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own claims" ON public.invitation_reward_claims;
CREATE POLICY "Users can view own claims" ON public.invitation_reward_claims FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT TO authenticated USING (((auth.uid() = participant_1) OR (auth.uid() = participant_2)));

DROP POLICY IF EXISTS "Users can view own encryption keys" ON public.conversation_encryption_keys;
CREATE POLICY "Users can view own encryption keys" ON public.conversation_encryption_keys FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own exchange history" ON public.user_beans_exchange_history;
CREATE POLICY "Users can view own exchange history" ON public.user_beans_exchange_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own face violations" ON public.live_face_violations;
CREATE POLICY "Users can view own face violations" ON public.live_face_violations FOR SELECT USING ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;
CREATE POLICY "Users can view own full profile" ON public.profiles FOR SELECT TO authenticated USING ((public.is_real_user() AND (auth.uid() = id)));

DROP POLICY IF EXISTS "Users can view own game transactions" ON public.game_transactions;
CREATE POLICY "Users can view own game transactions" ON public.game_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND (auth.uid() = user_id)));

DROP POLICY IF EXISTS "Users can view own helper applications" ON public.helper_applications;
CREATE POLICY "Users can view own helper applications" ON public.helper_applications FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own invitations" ON public.user_invitations;
CREATE POLICY "Users can view own invitations" ON public.user_invitations FOR SELECT TO authenticated USING (((auth.uid() = inviter_id) OR (auth.uid() = invited_user_id)));

DROP POLICY IF EXISTS "Users can view own moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Users can view own moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own orders" ON public.helper_orders;
CREATE POLICY "Users can view own orders" ON public.helper_orders FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own progress" ON public.user_task_progress;
CREATE POLICY "Users can view own progress" ON public.user_task_progress FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own purchases" ON public.user_purchases;
CREATE POLICY "Users can view own purchases" ON public.user_purchases FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own rating claims" ON public.rating_reward_claims;
CREATE POLICY "Users can view own rating claims" ON public.rating_reward_claims FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own recharges" ON public.recharge_transactions;
CREATE POLICY "Users can view own recharges" ON public.recharge_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = user_id) OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "Users can view own reels" ON public.reels;
CREATE POLICY "Users can view own reels" ON public.reels FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own reports" ON public.user_reports;
CREATE POLICY "Users can view own reports" ON public.user_reports FOR SELECT TO authenticated USING ((auth.uid() = reporter_id));

DROP POLICY IF EXISTS "Users can view own requests" ON public.host_conversion_requests;
CREATE POLICY "Users can view own requests" ON public.host_conversion_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own session logs" ON public.session_security_logs;
CREATE POLICY "Users can view own session logs" ON public.session_security_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own transactions" ON public.gift_transactions;
CREATE POLICY "Users can view own transactions" ON public.gift_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))));

DROP POLICY IF EXISTS "Users can view own welcome bonus" ON public.welcome_bonuses;
CREATE POLICY "Users can view own welcome bonus" ON public.welcome_bonuses FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own PK rewards" ON public.pk_reward_history;
CREATE POLICY "Users can view their own PK rewards" ON public.pk_reward_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own VIP subscriptions" ON public.user_vip_subscriptions;
CREATE POLICY "Users can view their own VIP subscriptions" ON public.user_vip_subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own application" ON public.host_applications;
CREATE POLICY "Users can view their own application" ON public.host_applications FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own bans" ON public.live_bans;
CREATE POLICY "Users can view their own bans" ON public.live_bans FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
CREATE POLICY "Users can view their own blocks" ON public.user_blocks FOR SELECT TO authenticated USING ((blocker_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own calls" ON public.private_calls;
CREATE POLICY "Users can view their own calls" ON public.private_calls FOR SELECT TO authenticated USING (((auth.uid() = caller_id) OR (auth.uid() = host_id)));

DROP POLICY IF EXISTS "Users can view their own entry banners" ON public.user_entry_banners;
CREATE POLICY "Users can view their own entry banners" ON public.user_entry_banners FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own face record" ON public.face_records;
CREATE POLICY "Users can view their own face record" ON public.face_records FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own invitations" ON public.seat_invitations;
CREATE POLICY "Users can view their own invitations" ON public.seat_invitations FOR SELECT TO authenticated USING (((invitee_id = auth.uid()) OR (host_id = auth.uid())));

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own offer claims" ON public.limited_offer_claims;
CREATE POLICY "Users can view their own offer claims" ON public.limited_offer_claims FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own orders by email" ON public.subscription_orders;
CREATE POLICY "Users can view their own orders by email" ON public.subscription_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view their own purchased backgrounds" ON public.user_purchased_backgrounds;
CREATE POLICY "Users can view their own purchased backgrounds" ON public.user_purchased_backgrounds FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own reports" ON public.reel_reports;
CREATE POLICY "Users can view their own reports" ON public.reel_reports FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own return history" ON public.consumption_return_history;
CREATE POLICY "Users can view their own return history" ON public.consumption_return_history FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own reward history" ON public.leaderboard_reward_history;
CREATE POLICY "Users can view their own reward history" ON public.leaderboard_reward_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own role frames" ON public.user_role_frames;
CREATE POLICY "Users can view their own role frames" ON public.user_role_frames FOR SELECT TO authenticated USING ((user_id = auth.uid()));