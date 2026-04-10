
-- PUBLIC CONFIG TABLES
CREATE POLICY "read_game_settings" ON public.game_settings FOR SELECT USING (true);
CREATE POLICY "read_gift_categories" ON public.gift_categories FOR SELECT USING (true);
CREATE POLICY "read_host_levels" ON public.host_levels FOR SELECT USING (true);
CREATE POLICY "read_vip_tiers" ON public.vip_tiers FOR SELECT USING (true);
CREATE POLICY "read_role_frames" ON public.role_frames FOR SELECT USING (true);
CREATE POLICY "read_topup_payment_methods" ON public.topup_payment_methods FOR SELECT USING (true);
CREATE POLICY "read_payment_gateways" ON public.payment_gateways FOR SELECT USING (true);
CREATE POLICY "read_reel_categories" ON public.reel_categories FOR SELECT USING (true);
CREATE POLICY "read_invitation_settings" ON public.invitation_settings FOR SELECT USING (true);
CREATE POLICY "read_poster_images" ON public.poster_images FOR SELECT USING (true);
CREATE POLICY "read_helper_payment_methods" ON public.helper_payment_methods FOR SELECT USING (true);
CREATE POLICY "read_ranking_rewards" ON public.ranking_rewards FOR SELECT USING (true);
CREATE POLICY "read_pk_reward_banners" ON public.pk_reward_banners FOR SELECT USING (true);
CREATE POLICY "read_pk_competition_rewards" ON public.pk_competition_rewards FOR SELECT USING (true);
CREATE POLICY "read_live_moderation_settings" ON public.live_moderation_settings FOR SELECT USING (true);
CREATE POLICY "read_party_room_banners" ON public.party_room_banners FOR SELECT USING (true);
CREATE POLICY "read_provider_games" ON public.provider_games FOR SELECT USING (true);
CREATE POLICY "read_user_level_thresholds" ON public.user_level_thresholds FOR SELECT USING (true);
CREATE POLICY "read_helper_assigned_countries" ON public.helper_assigned_countries FOR SELECT USING (true);

-- USER-OWNED DATA
CREATE POLICY "u_read_notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_update_notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_login_claims" ON public.daily_login_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_login_claims" ON public.daily_login_claims FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_read_recharge_claims" ON public.first_recharge_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_recharge_claims" ON public.first_recharge_claims FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_read_inv_claims" ON public.invitation_reward_claims FOR SELECT TO authenticated USING (auth.uid() = claimed_by);
CREATE POLICY "u_ins_inv_claims" ON public.invitation_reward_claims FOR INSERT TO authenticated WITH CHECK (auth.uid() = claimed_by);
CREATE POLICY "u_read_invitations" ON public.user_invitations FOR SELECT TO authenticated USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
CREATE POLICY "u_ins_invitations" ON public.user_invitations FOR INSERT TO authenticated WITH CHECK (auth.uid() = inviter_id);
CREATE POLICY "u_read_blocks" ON public.user_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "u_ins_blocks" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "u_del_blocks" ON public.user_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "u_read_streaks" ON public.user_login_streaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_streaks" ON public.user_login_streaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_upd_streaks" ON public.user_login_streaks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_bg" ON public.user_purchased_backgrounds FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_bg" ON public.user_purchased_backgrounds FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_read_entry_ban" ON public.user_entry_banners FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_entry_ban" ON public.user_entry_banners FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_upd_entry_ban" ON public.user_entry_banners FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_vip" ON public.user_vip_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_vip" ON public.user_vip_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_read_beans_ex" ON public.user_beans_exchange_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_beans_ex" ON public.user_beans_exchange_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_read_dev_tok" ON public.device_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_dev_tok" ON public.device_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_upd_dev_tok" ON public.device_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_del_dev_tok" ON public.device_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CALLS/STREAMS
CREATE POLICY "u_read_calls" ON public.call_events FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
CREATE POLICY "u_ins_calls" ON public.call_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "u_upd_calls" ON public.call_events FOR UPDATE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
CREATE POLICY "a_read_recordings" ON public.stream_recordings FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_live_bans" ON public.live_bans FOR SELECT TO authenticated USING (true);

-- REELS
CREATE POLICY "read_reels" ON public.reels FOR SELECT USING (true);
CREATE POLICY "u_ins_reels" ON public.reels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_upd_reels" ON public.reels FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_del_reels" ON public.reels FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "read_reel_comments" ON public.reel_comments FOR SELECT USING (true);
CREATE POLICY "u_ins_reel_comments" ON public.reel_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_del_reel_comments" ON public.reel_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "read_reel_likes" ON public.reel_likes FOR SELECT USING (true);
CREATE POLICY "u_ins_reel_likes" ON public.reel_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_del_reel_likes" ON public.reel_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_reel_reports" ON public.reel_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_ins_reel_reports" ON public.reel_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read_reel_shares" ON public.reel_shares FOR SELECT USING (true);
CREATE POLICY "u_ins_reel_shares" ON public.reel_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- GROUPS
CREATE POLICY "a_read_groups" ON public.groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_ins_groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "a_upd_groups" ON public.groups FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "a_read_grp_mem" ON public.group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_ins_grp_mem" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "a_del_grp_mem" ON public.group_members FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "a_read_grp_msg" ON public.group_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_ins_grp_msg" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- PARTY ROOMS
CREATE POLICY "a_read_party_msg" ON public.party_room_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_ins_party_msg" ON public.party_room_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "a_read_party_part" ON public.party_room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_ins_party_part" ON public.party_room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "a_del_party_part" ON public.party_room_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "a_upd_party_part" ON public.party_room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "a_read_seat_inv" ON public.seat_invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_seat_inv" ON public.seat_invitations FOR INSERT TO authenticated WITH CHECK (auth.uid() = inviter_id);
CREATE POLICY "a_read_seat_req" ON public.seat_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_seat_req" ON public.seat_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- GAMING/PK
CREATE POLICY "a_read_game_bets" ON public.game_bets FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_game_bets" ON public.game_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);
CREATE POLICY "a_read_game_players" ON public.game_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_game_players" ON public.game_players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "a_read_game_sess" ON public.game_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_game_stats" ON public.game_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_pk_battles" ON public.pk_battles FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_pk_battles" ON public.pk_battles FOR INSERT TO authenticated WITH CHECK (auth.uid() = host1_id OR auth.uid() = host2_id);
CREATE POLICY "a_read_pk_gifts" ON public.pk_battle_gifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_pk_gifts" ON public.pk_battle_gifts FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "a_read_pk_comp" ON public.pk_competitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_pk_part" ON public.pk_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_pk_part" ON public.pk_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_read_pk_rewards" ON public.pk_reward_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "a_read_lg_rounds" ON public.live_game_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_lg_bets" ON public.live_game_bets FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_lg_bets" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "a_read_roulette_sess" ON public.roulette_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_roulette_bets" ON public.roulette_bets FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_roulette_bets" ON public.roulette_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- TRANSACTIONS/PAYMENTS
CREATE POLICY "u_read_recharge_txn" ON public.recharge_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_payment_txn" ON public.payment_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_payroll" ON public.payroll_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "u_read_trader_purch" ON public.trader_level_purchases FOR SELECT TO authenticated USING (auth.uid() = trader_id);

-- AGENCY
CREATE POLICY "a_read_agency_comm" ON public.agency_commission_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_agency_dia" ON public.agency_diamond_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_agency_earn" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_agency_perf" ON public.agency_performance FOR SELECT TO authenticated USING (true);

-- SUB-AGENTS
CREATE POLICY "a_read_sub_agents" ON public.sub_agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_ins_sub_agent" ON public.sub_agents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "u_upd_sub_agent" ON public.sub_agents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "a_read_sub_ref" ON public.sub_agent_referrals FOR SELECT TO authenticated USING (true);
CREATE POLICY "u_read_sub_comm" ON public.sub_agent_commissions FOR SELECT TO authenticated USING (auth.uid() = sub_agent_id);

-- HOST/HELPER
CREATE POLICY "u_read_host_conv" ON public.host_conversion_requests FOR SELECT TO authenticated USING (auth.uid() = host_id);
CREATE POLICY "u_ins_host_conv" ON public.host_conversion_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "u_read_hlp_topup" ON public.helper_topup_requests FOR SELECT TO authenticated USING (auth.uid() = helper_id);
CREATE POLICY "u_read_hlp_upgr" ON public.helper_upgrade_requests FOR SELECT TO authenticated USING (auth.uid() = helper_id);
CREATE POLICY "u_ins_hlp_upgr" ON public.helper_upgrade_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = helper_id);
CREATE POLICY "u_read_hlp_notif" ON public.helper_notifications FOR SELECT TO authenticated USING (auth.uid() = helper_id);
CREATE POLICY "a_read_hlp_admin_msg" ON public.helper_admin_messages FOR SELECT TO authenticated USING (true);

-- ENCRYPTION
CREATE POLICY "a_read_conv_keys" ON public.conversation_encryption_keys FOR SELECT TO authenticated USING (true);

-- ADMIN TABLES
CREATE POLICY "a_read_admin_dev" ON public.admin_allowed_devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_ins_admin_dev" ON public.admin_allowed_devices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "a_upd_admin_dev" ON public.admin_allowed_devices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "a_read_admin_inv" ON public.admin_invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_admin_otp" ON public.admin_login_otps FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_admin_notif" ON public.admin_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_upd_admin_notif" ON public.admin_notifications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "a_read_admin_perms" ON public.admin_section_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_admin_sects" ON public.admin_sections FOR SELECT TO authenticated USING (true);

-- SECURITY/INTERNAL
CREATE POLICY "a_read_lockouts" ON public.account_lockouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_email_otps" ON public.email_otps FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_phone_otps" ON public.phone_otps FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_pw_otps" ON public.password_reset_otps FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_recovery" ON public.recovery_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_fail_login" ON public.failed_login_attempts FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_login_att" ON public.login_attempts FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_rate_lim" ON public.rate_limits FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_rate_att" ON public.rate_limit_attempts FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_sess_sec" ON public.session_security_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_sec_audit" ON public.security_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_call_sec" ON public.private_call_security_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "a_read_pay_recon" ON public.payment_reconciliation_log FOR SELECT TO authenticated USING (true);
