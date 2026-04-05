DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage currency rates" ON public.currency_rates';
  EXECUTE 'CREATE POLICY "Admins can manage currency rates" ON public.currency_rates TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage entertainment" ON public.entertainment';
  EXECUTE 'CREATE POLICY "Admins can manage entertainment" ON public.entertainment TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage entry name bars" ON public.entry_name_bars';
  EXECUTE 'CREATE POLICY "Admins can manage entry name bars" ON public.entry_name_bars TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage exchange tiers" ON public.user_beans_exchange_tiers';
  EXECUTE 'CREATE POLICY "Admins can manage exchange tiers" ON public.user_beans_exchange_tiers TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage first recharge" ON public.first_recharge_bonus';
  EXECUTE 'CREATE POLICY "Admins can manage first recharge" ON public.first_recharge_bonus USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage frames" ON public.avatar_frames';
  EXECUTE 'CREATE POLICY "Admins can manage frames" ON public.avatar_frames TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage game providers" ON public.game_providers';
  EXECUTE 'CREATE POLICY "Admins can manage game providers" ON public.game_providers TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage game server settings" ON public.game_server_settings';
  EXECUTE 'CREATE POLICY "Admins can manage game server settings" ON public.game_server_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage helper applications" ON public.helper_applications';
  EXECUTE 'CREATE POLICY "Admins can manage helper applications" ON public.helper_applications TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage helper country assignments" ON public.helper_assigned_countries';
  EXECUTE 'CREATE POLICY "Admins can manage helper country assignments" ON public.helper_assigned_countries TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage helper diamond packages" ON public.helper_diamond_packages';
  EXECUTE 'CREATE POLICY "Admins can manage helper diamond packages" ON public.helper_diamond_packages TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage helper level config" ON public.helper_level_config';
  EXECUTE 'CREATE POLICY "Admins can manage helper level config" ON public.helper_level_config TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage helpers" ON public.topup_helpers';
  EXECUTE 'CREATE POLICY "Admins can manage helpers" ON public.topup_helpers TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage invitation settings" ON public.invitation_settings';
  EXECUTE 'CREATE POLICY "Admins can manage invitation settings" ON public.invitation_settings TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage iptv sources" ON public.iptv_sources';
  EXECUTE 'CREATE POLICY "Admins can manage iptv sources" ON public.iptv_sources TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage kids content" ON public.kids_content';
  EXECUTE 'CREATE POLICY "Admins can manage kids content" ON public.kids_content TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage landing sections" ON public.landing_page_sections';
  EXECUTE 'CREATE POLICY "Admins can manage landing sections" ON public.landing_page_sections TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage level config" ON public.helper_level_config';
  EXECUTE 'CREATE POLICY "Admins can manage level config" ON public.helper_level_config TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage login rewards" ON public.daily_login_rewards_config';
  EXECUTE 'CREATE POLICY "Admins can manage login rewards" ON public.daily_login_rewards_config USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage movies" ON public.movies';
  EXECUTE 'CREATE POLICY "Admins can manage movies" ON public.movies TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage music" ON public.music';
  EXECUTE 'CREATE POLICY "Admins can manage music" ON public.music TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage news" ON public.news';
  EXECUTE 'CREATE POLICY "Admins can manage news" ON public.news TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage news sources" ON public.news_sources';
  EXECUTE 'CREATE POLICY "Admins can manage news sources" ON public.news_sources TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage notification templates" ON public.notification_templates';
  EXECUTE 'CREATE POLICY "Admins can manage notification templates" ON public.notification_templates TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage offers" ON public.limited_time_offers';
  EXECUTE 'CREATE POLICY "Admins can manage offers" ON public.limited_time_offers USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage packages" ON public.coin_packages';
  EXECUTE 'CREATE POLICY "Admins can manage packages" ON public.coin_packages TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage payment gateways" ON public.payment_gateways';
  EXECUTE 'CREATE POLICY "Admins can manage payment gateways" ON public.payment_gateways TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage penalty tiers" ON public.violation_penalty_tiers';
  EXECUTE 'CREATE POLICY "Admins can manage penalty tiers" ON public.violation_penalty_tiers TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage podium frames" ON public.leaderboard_podium_frames';
  EXECUTE 'CREATE POLICY "Admins can manage podium frames" ON public.leaderboard_podium_frames TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage popup banners" ON public.popup_event_banners';
  EXECUTE 'CREATE POLICY "Admins can manage popup banners" ON public.popup_event_banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage privileges" ON public.level_privileges';
  EXECUTE 'CREATE POLICY "Admins can manage privileges" ON public.level_privileges TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage provider logs" ON public.game_provider_logs';
  EXECUTE 'CREATE POLICY "Admins can manage provider logs" ON public.game_provider_logs TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage reward config" ON public.leaderboard_reward_config';
  EXECUTE 'CREATE POLICY "Admins can manage reward config" ON public.leaderboard_reward_config TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage role frames" ON public.role_frames';
  EXECUTE 'CREATE POLICY "Admins can manage role frames" ON public.role_frames TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles';
  EXECUTE 'CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage subtitles" ON public.content_subtitles';
  EXECUTE 'CREATE POLICY "Admins can manage subtitles" ON public.content_subtitles TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage tasks" ON public.daily_tasks';
  EXECUTE 'CREATE POLICY "Admins can manage tasks" ON public.daily_tasks TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage themes" ON public.app_event_themes';
  EXECUTE 'CREATE POLICY "Admins can manage themes" ON public.app_event_themes USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage transactions" ON public.helper_transactions';
  EXECUTE 'CREATE POLICY "Admins can manage transactions" ON public.helper_transactions TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can manage welcome messages" ON public.room_welcome_messages';
  EXECUTE 'CREATE POLICY "Admins can manage welcome messages" ON public.room_welcome_messages TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles';
  EXECUTE 'CREATE POLICY "Admins can read roles" ON public.user_roles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), ''admin''::public.app_role) OR (auth.uid() = user_id)));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can resolve security alerts" ON public.security_alerts';
  EXECUTE 'CREATE POLICY "Admins can resolve security alerts" ON public.security_alerts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can send messages to any ticket" ON public.support_messages';
  EXECUTE 'CREATE POLICY "Admins can send messages to any ticket" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update agencies" ON public.agencies';
  EXECUTE 'CREATE POLICY "Admins can update agencies" ON public.agencies FOR UPDATE USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update all tickets" ON public.support_tickets';
  EXECUTE 'CREATE POLICY "Admins can update all tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles';
  EXECUTE 'CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update any stream" ON public.live_streams';
  EXECUTE 'CREATE POLICY "Admins can update any stream" ON public.live_streams FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update error logs" ON public.system_error_logs';
  EXECUTE 'CREATE POLICY "Admins can update error logs" ON public.system_error_logs FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update face violations" ON public.live_face_violations';
  EXECUTE 'CREATE POLICY "Admins can update face violations" ON public.live_face_violations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update gifts" ON public.gifts';
  EXECUTE 'CREATE POLICY "Admins can update gifts" ON public.gifts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update messages" ON public.support_messages';
  EXECUTE 'CREATE POLICY "Admins can update messages" ON public.support_messages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update moderation settings" ON public.live_moderation_settings';
  EXECUTE 'CREATE POLICY "Admins can update moderation settings" ON public.live_moderation_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update own profile" ON public.admin_users';
  EXECUTE 'CREATE POLICY "Admins can update own profile" ON public.admin_users FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update rating claims" ON public.rating_reward_claims';
  EXECUTE 'CREATE POLICY "Admins can update rating claims" ON public.rating_reward_claims FOR UPDATE USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
DO $safe$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Admins can update replies" ON public.helper_message_replies';
  EXECUTE 'CREATE POLICY "Admins can update replies" ON public.helper_message_replies FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;