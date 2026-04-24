DROP POLICY IF EXISTS "Agency owners can view their transfers" ON public.agency_earnings_transfers;
CREATE POLICY "Agency owners can view their transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_earnings_transfers.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "Hosts can view their own transfers" ON public.agency_earnings_transfers;
CREATE POLICY "Hosts can view their own transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND (host_id = auth.uid())));

DROP POLICY IF EXISTS "Admins can add hosts to agencies" ON public.agency_hosts;
CREATE POLICY "Admins can add hosts to agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Hosts can cancel their own pending requests" ON public.agency_hosts;
CREATE POLICY "Hosts can cancel their own pending requests" ON public.agency_hosts FOR DELETE TO authenticated USING (((host_id = auth.uid()) AND (status = 'pending'::text)));

DROP POLICY IF EXISTS "Only admins manage agency hosts" ON public.agency_hosts;
CREATE POLICY "Only admins manage agency hosts" ON public.agency_hosts TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can join agencies" ON public.agency_hosts;
CREATE POLICY "Users can join agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DROP POLICY IF EXISTS "Users can view agency hosts" ON public.agency_hosts;
CREATE POLICY "Users can view agency hosts" ON public.agency_hosts FOR SELECT TO authenticated USING (((host_id = auth.uid()) OR public.is_admin(auth.uid()) OR public.is_agency_owner(auth.uid(), agency_id)));

DROP POLICY IF EXISTS "Admins manage agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Admins manage agency level tiers" ON public.agency_level_tiers TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Anyone can view agency level tiers" ON public.agency_level_tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view performance" ON public.agency_performance;
CREATE POLICY "Anyone can view performance" ON public.agency_performance FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "No direct performance updates" ON public.agency_performance;
CREATE POLICY "No direct performance updates" ON public.agency_performance FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "Anyone can view active policies" ON public.agency_policy_settings;
CREATE POLICY "Anyone can view active policies" ON public.agency_policy_settings FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Only admins can manage agency policies" ON public.agency_policy_settings;
CREATE POLICY "Only admins can manage agency policies" ON public.agency_policy_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view rankings" ON public.agency_rankings;
CREATE POLICY "Anyone can view rankings" ON public.agency_rankings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can manage rankings" ON public.agency_rankings;
CREATE POLICY "Only admins can manage rankings" ON public.agency_rankings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all agency withdrawals" ON public.agency_withdrawals;
CREATE POLICY "Admins can manage all agency withdrawals" ON public.agency_withdrawals TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Agency owners can create withdrawal requests" ON public.agency_withdrawals;
CREATE POLICY "Agency owners can create withdrawal requests" ON public.agency_withdrawals FOR INSERT TO authenticated WITH CHECK ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));

DROP POLICY IF EXISTS "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals;
CREATE POLICY "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals FOR UPDATE TO authenticated USING ((public.is_real_user() AND (EXISTS ( SELECT 1 FROM (public.topup_helpers th JOIN public.helper_assigned_countries hac ON ((hac.helper_id = th.id))) WHERE ((th.user_id = auth.uid()) AND (th.trader_level = 5) AND (th.payroll_enabled = true) AND (th.is_active = true) AND (hac.country_code = agency_withdrawals.country_code) AND (hac.is_active = true))))));

DROP POLICY IF EXISTS "Withdrawal access restricted to stakeholders" ON public.agency_withdrawals;
CREATE POLICY "Withdrawal access restricted to stakeholders" ON public.agency_withdrawals FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_withdrawals.agency_id) AND (agencies.owner_id = auth.uid())))) OR (assigned_helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Anyone can view active links" ON public.allowed_external_links;
CREATE POLICY "Anyone can view active links" ON public.allowed_external_links FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Authenticated can read allowed links" ON public.allowed_external_links;
CREATE POLICY "Authenticated can read allowed links" ON public.allowed_external_links FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can delete allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can delete allowed links" ON public.allowed_external_links FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Only admins can insert allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can insert allowed links" ON public.allowed_external_links FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Only admins can update allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can update allowed links" ON public.allowed_external_links FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Anyone can read active content" ON public.app_content;
CREATE POLICY "Anyone can read active content" ON public.app_content FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Only admins can manage content" ON public.app_content;
CREATE POLICY "Only admins can manage content" ON public.app_content TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage themes" ON public.app_event_themes;
CREATE POLICY "Admins can manage themes" ON public.app_event_themes USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Anyone can read themes" ON public.app_event_themes;
CREATE POLICY "Anyone can read themes" ON public.app_event_themes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can read icons" ON public.app_icon_registry;
CREATE POLICY "Anyone can read icons" ON public.app_icon_registry FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage icons" ON public.app_icon_registry;
CREATE POLICY "Authenticated users can manage icons" ON public.app_icon_registry TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can manage settings" ON public.app_settings;
CREATE POLICY "Only admins can manage settings" ON public.app_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read app version settings" ON public.app_version_settings;
CREATE POLICY "Anyone can read app version settings" ON public.app_version_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can manage version settings" ON public.app_version_settings;
CREATE POLICY "Only admins can manage version settings" ON public.app_version_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin full access ar_stickers" ON public.ar_stickers;
CREATE POLICY "Admin full access ar_stickers" ON public.ar_stickers USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DROP POLICY IF EXISTS "Anyone can view active ar stickers" ON public.ar_stickers;
CREATE POLICY "Anyone can view active ar stickers" ON public.ar_stickers FOR SELECT USING ((is_active = true));

DROP POLICY IF EXISTS "Admins can manage frames" ON public.avatar_frames;
CREATE POLICY "Admins can manage frames" ON public.avatar_frames TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view frames" ON public.avatar_frames;
CREATE POLICY "Anyone can view frames" ON public.avatar_frames FOR SELECT USING (true);

DROP POLICY IF EXISTS "No direct frame deletes" ON public.avatar_frames;
CREATE POLICY "No direct frame deletes" ON public.avatar_frames FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No direct frame inserts" ON public.avatar_frames;
CREATE POLICY "No direct frame inserts" ON public.avatar_frames FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct frame updates" ON public.avatar_frames;
CREATE POLICY "No direct frame updates" ON public.avatar_frames FOR UPDATE TO authenticated USING (false);