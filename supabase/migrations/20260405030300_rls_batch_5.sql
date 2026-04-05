-- RLS Safe Migration Batch 3

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update reports" ON public.user_reports;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update reports" ON public.user_reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update requests" ON public.host_conversion_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update requests" ON public.host_conversion_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update trader level tiers" ON public.trader_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update trader level tiers" ON public.trader_level_tiers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update upgrade requests" ON public.helper_upgrade_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update upgrade requests" ON public.helper_upgrade_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update user level tiers" ON public.user_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update user level tiers" ON public.user_level_tiers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view active sections" ON public.admin_sections;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view active sections" ON public.admin_sections FOR SELECT TO authenticated USING ((public.is_real_user() AND ((is_active = true) OR public.is_admin(auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all applications" ON public.host_applications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all applications" ON public.host_applications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY[''admin''::public.app_role, ''moderator''::public.app_role]))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all claims" ON public.daily_login_claims;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all claims" ON public.daily_login_claims FOR SELECT USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all coin transfers" ON public.coin_transfers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all coin transfers" ON public.coin_transfers FOR SELECT USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all face violations" ON public.live_face_violations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all face violations" ON public.live_face_violations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all first recharge claims" ON public.first_recharge_claims;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all first recharge claims" ON public.first_recharge_claims FOR SELECT USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all gift logs" ON public.gift_transaction_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all gift logs" ON public.gift_transaction_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all gift transactions" ON public.gift_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all gift transactions" ON public.gift_transactions FOR SELECT USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all moderation logs" ON public.chat_moderation_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all rating claims" ON public.rating_reward_claims;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all rating claims" ON public.rating_reward_claims FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all replies" ON public.helper_message_replies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all replies" ON public.helper_message_replies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all reports" ON public.user_reports;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all reports" ON public.user_reports FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all requests" ON public.host_conversion_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all requests" ON public.host_conversion_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all reward history" ON public.leaderboard_reward_history;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all reward history" ON public.leaderboard_reward_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all streaks" ON public.user_login_streaks;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all streaks" ON public.user_login_streaks FOR SELECT USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all stream recordings" ON public.stream_recordings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all stream recordings" ON public.stream_recordings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all submissions" ON public.face_verification_submissions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all submissions" ON public.face_verification_submissions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all topup requests" ON public.helper_topup_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all topup requests" ON public.helper_topup_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all transactions" ON public.payment_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all transactions" ON public.payment_transactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all upgrade requests" ON public.helper_upgrade_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all upgrade requests" ON public.helper_upgrade_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view audit logs" ON public.security_audit_log;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view audit logs" ON public.security_audit_log FOR SELECT TO authenticated USING (public.is_admin());';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view devices" ON public.admin_allowed_devices;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view devices" ON public.admin_allowed_devices FOR SELECT TO authenticated USING ((public.is_real_user() AND (public.is_admin(auth.uid()) OR (admin_user_id IN ( SELECT admin_users.id FROM public.admin_users WHERE (admin_users.user_id = auth.uid()))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view login attempts" ON public.login_attempts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view login attempts" ON public.login_attempts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view logs" ON public.admin_logs FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view own permissions" ON public.admin_section_permissions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view own permissions" ON public.admin_section_permissions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((admin_user_id IN ( SELECT admin_users.id FROM public.admin_users WHERE (admin_users.user_id = auth.uid()))) OR public.is_admin(auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view own record" ON public.admin_users;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view own record" ON public.admin_users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view security alerts" ON public.security_alerts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view security alerts" ON public.security_alerts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view security logs" ON public.private_call_security_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view security logs" ON public.private_call_security_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view stats" ON public.admin_stats;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view stats" ON public.admin_stats FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view vpn logs" ON public.vpn_detection_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view vpn logs" ON public.vpn_detection_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to claims" ON public.invitation_reward_claims;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins full access to claims" ON public.invitation_reward_claims TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins manage agency level tiers" ON public.agency_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins manage agency level tiers" ON public.agency_level_tiers TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins manage all helper withdrawals" ON public.helper_withdrawal_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins manage all helper withdrawals" ON public.helper_withdrawal_requests TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can create payroll requests" ON public.payroll_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can create payroll requests" ON public.payroll_requests FOR INSERT TO authenticated WITH CHECK ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can create withdrawal requests" ON public.agency_withdrawals;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can create withdrawal requests" ON public.agency_withdrawals FOR INSERT TO authenticated WITH CHECK ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can insert transactions" ON public.agency_diamond_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can insert transactions" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_diamond_transactions.agency_id) AND (agencies.owner_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can manage sub-agents" ON public.sub_agents;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can manage sub-agents" ON public.sub_agents TO authenticated USING ((auth.uid() IN ( SELECT agencies.owner_id FROM public.agencies WHERE (agencies.id = sub_agents.agency_id)))) WITH CHECK ((auth.uid() IN ( SELECT agencies.owner_id FROM public.agencies WHERE (agencies.id = sub_agents.agency_id))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view all referrals" ON public.sub_agent_referrals;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can view all referrals" ON public.sub_agent_referrals FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT a.owner_id FROM (public.agencies a JOIN public.sub_agents sa ON ((sa.agency_id = a.id))) WHERE (sa.id = sub_agent_referrals.sub_agent_id))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their commission history" ON public.agency_commission_history;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can view their commission history" ON public.agency_commission_history FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_commission_history.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their payroll requests" ON public.payroll_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can view their payroll requests" ON public.payroll_requests FOR SELECT TO authenticated USING ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their transactions" ON public.agency_diamond_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can view their transactions" ON public.agency_diamond_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_diamond_transactions.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their transfers" ON public.agency_earnings_transfers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Agency owners can view their transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_earnings_transfers.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow anon to read host applications" ON public.host_applications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Allow anon to read host applications" ON public.host_applications FOR SELECT TO anon USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can insert error logs with validation" ON public.system_error_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can insert error logs with validation" ON public.system_error_logs FOR INSERT TO anon WITH CHECK (((error_type IS NOT NULL) AND (error_message IS NOT NULL) AND (length(error_message) <= 5000)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active banners" ON public.banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active banners" ON public.banners FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active coin packages" ON public.coin_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active coin packages" ON public.coin_packages FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active currency rates" ON public.currency_rates;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active currency rates" ON public.currency_rates FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active game settings" ON public.game_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anon can view active game settings" ON public.game_settings FOR SELECT TO anon USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;
