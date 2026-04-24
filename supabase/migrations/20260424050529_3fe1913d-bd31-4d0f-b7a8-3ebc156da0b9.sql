DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
CREATE POLICY "Admins can manage banners" ON public.banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anon can view active banners" ON public.banners;
CREATE POLICY "Anon can view active banners" ON public.banners FOR SELECT TO anon USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banners;
CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Admin full access beauty_filters" ON public.beauty_filters;
CREATE POLICY "Admin full access beauty_filters" ON public.beauty_filters USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Anyone can view active beauty filters" ON public.beauty_filters;
CREATE POLICY "Anyone can view active beauty filters" ON public.beauty_filters FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Admins can manage blocked IPs" ON public.blocked_ips;
CREATE POLICY "Admins can manage blocked IPs" ON public.blocked_ips TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role full access to blocked IPs" ON public.blocked_ips;
CREATE POLICY "Service role full access to blocked IPs" ON public.blocked_ips TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can insert branding settings" ON public.branding_settings;
CREATE POLICY "Admins can insert branding settings" ON public.branding_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read branding settings" ON public.branding_settings;
CREATE POLICY "Anyone can read branding settings" ON public.branding_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view branding settings" ON public.branding_settings;
CREATE POLICY "Anyone can view branding settings" ON public.branding_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can update branding" ON public.branding_settings;
CREATE POLICY "Only admins can update branding" ON public.branding_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Call participants can view events" ON public.call_events;
CREATE POLICY "Call participants can view events" ON public.call_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.private_calls WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));

DROP POLICY IF EXISTS "System can insert call events" ON public.call_events;
CREATE POLICY "System can insert call events" ON public.call_events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.private_calls WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));

DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Admins can manage channels" ON public.channels;
CREATE POLICY "Admins can manage channels" ON public.channels TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Anyone can view active channels" ON public.channels;
CREATE POLICY "Anyone can view active channels" ON public.channels FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Admins can view all moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Admins can view all moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Authenticated users can insert moderation logs" ON public.chat_moderation_logs FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Users can view own moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Users can view own moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can manage packages" ON public.coin_packages;
CREATE POLICY "Admins can manage packages" ON public.coin_packages TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Anon can view active coin packages" ON public.coin_packages;
CREATE POLICY "Anon can view active coin packages" ON public.coin_packages FOR SELECT TO anon USING ((is_active = true));

DROP POLICY IF EXISTS "Anyone can view active packages" ON public.coin_packages;
CREATE POLICY "Anyone can view active packages" ON public.coin_packages FOR SELECT TO authenticated USING ((public.is_real_user() AND (is_active = true)));

DROP POLICY IF EXISTS "No direct coin_package deletes" ON public.coin_packages;
CREATE POLICY "No direct coin_package deletes" ON public.coin_packages FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct coin_package inserts" ON public.coin_packages;
CREATE POLICY "No direct coin_package inserts" ON public.coin_packages FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct coin_package updates" ON public.coin_packages;
CREATE POLICY "No direct coin_package updates" ON public.coin_packages FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "Admins can view all coin transfers" ON public.coin_transfers;
CREATE POLICY "Admins can view all coin transfers" ON public.coin_transfers FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "No direct coin transfer inserts" ON public.coin_transfers;
CREATE POLICY "No direct coin transfer inserts" ON public.coin_transfers FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct coin_transfer deletes" ON public.coin_transfers;
CREATE POLICY "No direct coin_transfer deletes" ON public.coin_transfers FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct coin_transfer updates" ON public.coin_transfers;
CREATE POLICY "No direct coin_transfer updates" ON public.coin_transfers FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "Users can view their own transfers" ON public.coin_transfers;
CREATE POLICY "Users can view their own transfers" ON public.coin_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))));

DROP POLICY IF EXISTS "Admins can manage cashback tiers" ON public.consumption_return_config;
CREATE POLICY "Admins can manage cashback tiers" ON public.consumption_return_config USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read consumption return config" ON public.consumption_return_config;
CREATE POLICY "Anyone can read consumption return config" ON public.consumption_return_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage cashback history" ON public.consumption_return_history;
CREATE POLICY "Admins can manage cashback history" ON public.consumption_return_history USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can claim their returns" ON public.consumption_return_history;
CREATE POLICY "Users can claim their returns" ON public.consumption_return_history FOR UPDATE USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read own cashback history" ON public.consumption_return_history;
CREATE POLICY "Users can read own cashback history" ON public.consumption_return_history FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own return history" ON public.consumption_return_history;
CREATE POLICY "Users can view their own return history" ON public.consumption_return_history FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Admins can manage audio tracks" ON public.content_audio_tracks;
CREATE POLICY "Admins can manage audio tracks" ON public.content_audio_tracks TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::text)))));

DROP POLICY IF EXISTS "Anyone can read active audio tracks" ON public.content_audio_tracks;
CREATE POLICY "Anyone can read active audio tracks" ON public.content_audio_tracks FOR SELECT USING ((is_active = true));