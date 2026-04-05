DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings';
  EXECUTE 'CREATE POLICY "Admins can manage app settings" ON public.app_settings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage call rate configs" ON public.call_rate_configs';
  EXECUTE 'CREATE POLICY "Admins can manage call rate configs" ON public.call_rate_configs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage consumption config" ON public.consumption_return_config';
  EXECUTE 'CREATE POLICY "Admins can manage consumption config" ON public.consumption_return_config USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage currency rates" ON public.currency_rates';
  EXECUTE 'CREATE POLICY "Admins can manage currency rates" ON public.currency_rates USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage event themes" ON public.app_event_themes';
  EXECUTE 'CREATE POLICY "Admins can manage event themes" ON public.app_event_themes USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage feature requirements" ON public.feature_level_requirements';
  EXECUTE 'CREATE POLICY "Admins can manage feature requirements" ON public.feature_level_requirements USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage first recharge bonus" ON public.first_recharge_bonus';
  EXECUTE 'CREATE POLICY "Admins can manage first recharge bonus" ON public.first_recharge_bonus USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage icon registry" ON public.app_icon_registry';
  EXECUTE 'CREATE POLICY "Admins can manage icon registry" ON public.app_icon_registry USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage level tiers" ON public.agency_level_tiers';
  EXECUTE 'CREATE POLICY "Admins can manage level tiers" ON public.agency_level_tiers USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage policy settings" ON public.agency_policy_settings';
  EXECUTE 'CREATE POLICY "Admins can manage policy settings" ON public.agency_policy_settings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage rankings" ON public.agency_rankings';
  EXECUTE 'CREATE POLICY "Admins can manage rankings" ON public.agency_rankings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage special UIDs" ON public.special_uid_store';
  EXECUTE 'CREATE POLICY "Admins can manage special UIDs" ON public.special_uid_store USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage vip configs" ON public.vip_level_configs';
  EXECUTE 'CREATE POLICY "Admins can manage vip configs" ON public.vip_level_configs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles';
  EXECUTE 'CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update reports" ON public.user_reports';
  EXECUTE 'CREATE POLICY "Admins can update reports" ON public.user_reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update withdrawals" ON public.agency_withdrawals';
  EXECUTE 'CREATE POLICY "Admins can update withdrawals" ON public.agency_withdrawals FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can view all blocked devices" ON public.banned_devices';
  EXECUTE 'CREATE POLICY "Admins can view all blocked devices" ON public.banned_devices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can view all blocked ips" ON public.blocked_ips';
  EXECUTE 'CREATE POLICY "Admins can view all blocked ips" ON public.blocked_ips FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can view all face verifications" ON public.face_verification_submissions';
  EXECUTE 'CREATE POLICY "Admins can view all face verifications" ON public.face_verification_submissions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can view all gift transactions" ON public.gift_transactions';
  EXECUTE 'CREATE POLICY "Admins can view all gift transactions" ON public.gift_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access audio tracks" ON public.content_audio_tracks';
  EXECUTE 'CREATE POLICY "Admins full access audio tracks" ON public.content_audio_tracks USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access subtitles" ON public.content_subtitles';
  EXECUTE 'CREATE POLICY "Admins full access subtitles" ON public.content_subtitles USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access to branding" ON public.branding_settings';
  EXECUTE 'CREATE POLICY "Admins full access to branding" ON public.branding_settings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access to entertainment" ON public.entertainment';
  EXECUTE 'CREATE POLICY "Admins full access to entertainment" ON public.entertainment USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access to game providers" ON public.game_providers';
  EXECUTE 'CREATE POLICY "Admins full access to game providers" ON public.game_providers USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access to game server settings" ON public.game_server_settings';
  EXECUTE 'CREATE POLICY "Admins full access to game server settings" ON public.game_server_settings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access to live gifts" ON public.live_gift_configs';
  EXECUTE 'CREATE POLICY "Admins full access to live gifts" ON public.live_gift_configs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins full access to streaming settings" ON public.streaming_server_settings';
  EXECUTE 'CREATE POLICY "Admins full access to streaming settings" ON public.streaming_server_settings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage blocked devices" ON public.banned_devices';
  EXECUTE 'CREATE POLICY "Admins manage blocked devices" ON public.banned_devices TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage blocked ips" ON public.blocked_ips';
  EXECUTE 'CREATE POLICY "Admins manage blocked ips" ON public.blocked_ips TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage categories" ON public.categories';
  EXECUTE 'CREATE POLICY "Admins manage categories" ON public.categories USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage channels" ON public.channels';
  EXECUTE 'CREATE POLICY "Admins manage channels" ON public.channels USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage external links" ON public.allowed_external_links';
  EXECUTE 'CREATE POLICY "Admins manage external links" ON public.allowed_external_links USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage game provider logs" ON public.game_provider_logs';
  EXECUTE 'CREATE POLICY "Admins manage game provider logs" ON public.game_provider_logs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage helper traders" ON public.topup_helpers';
  EXECUTE 'CREATE POLICY "Admins manage helper traders" ON public.topup_helpers USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage referral rewards" ON public.referral_rewards';
  EXECUTE 'CREATE POLICY "Admins manage referral rewards" ON public.referral_rewards USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage salary configs" ON public.host_salary_configs';
  EXECUTE 'CREATE POLICY "Admins manage salary configs" ON public.host_salary_configs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage salary progress" ON public.host_salary_progress';
  EXECUTE 'CREATE POLICY "Admins manage salary progress" ON public.host_salary_progress USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins manage weekly earnings" ON public.host_weekly_earnings';
  EXECUTE 'CREATE POLICY "Admins manage weekly earnings" ON public.host_weekly_earnings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins update face verifications" ON public.face_verification_submissions';
  EXECUTE 'CREATE POLICY "Admins update face verifications" ON public.face_verification_submissions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins update helper status" ON public.helper_messages';
  EXECUTE 'CREATE POLICY "Admins update helper status" ON public.helper_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins view helper messages" ON public.helper_messages';
  EXECUTE 'CREATE POLICY "Admins view helper messages" ON public.helper_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins view replies" ON public.helper_message_replies';
  EXECUTE 'CREATE POLICY "Admins view replies" ON public.helper_message_replies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update replies" ON public.helper_message_replies';
  EXECUTE 'CREATE POLICY "Admins can update replies" ON public.helper_message_replies FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;