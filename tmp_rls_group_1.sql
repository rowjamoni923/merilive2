-- === RLS Batch 1 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can manage bonus settings" ON public.new_host_live_bonus_settings;
END $$;
CREATE POLICY "Admin can manage bonus settings" ON public.new_host_live_bonus_settings TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all bonus progress" ON public.new_host_live_bonus_progress;
END $$;
CREATE POLICY "Admin can read all bonus progress" ON public.new_host_live_bonus_progress FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can view all claims" ON public.parcel_claims;
END $$;
CREATE POLICY "Admin can view all claims" ON public.parcel_claims FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can view all parcels" ON public.user_parcels;
END $$;
CREATE POLICY "Admin can view all parcels" ON public.user_parcels FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can view all private calls" ON public.private_calls;
END $$;
CREATE POLICY "Admin can view all private calls" ON public.private_calls FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access ar_stickers" ON public.ar_stickers;
END $$;
CREATE POLICY "Admin full access ar_stickers" ON public.ar_stickers USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access beauty_filters" ON public.beauty_filters;
END $$;
CREATE POLICY "Admin full access beauty_filters" ON public.beauty_filters USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access game_configs" ON public.game_configs;
END $$;
CREATE POLICY "Admin full access game_configs" ON public.game_configs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access to parcel templates" ON public.parcel_templates;
END $$;
CREATE POLICY "Admin full access to parcel templates" ON public.parcel_templates TO authenticated USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can delete entry banners" ON public.entry_banners;
END $$;
CREATE POLICY "Admin users can delete entry banners" ON public.entry_banners FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can delete party room backgrounds" ON public.party_room_backgrounds;
END $$;
CREATE POLICY "Admin users can delete party room backgrounds" ON public.party_room_backgrounds FOR DELETE TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can insert entry banners" ON public.entry_banners;
END $$;
CREATE POLICY "Admin users can insert entry banners" ON public.entry_banners FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can insert party room backgrounds" ON public.party_room_backgrounds;
END $$;
CREATE POLICY "Admin users can insert party room backgrounds" ON public.party_room_backgrounds FOR INSERT TO authenticated WITH CHECK ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can update any party room" ON public.party_rooms;
END $$;
CREATE POLICY "Admin users can update any party room" ON public.party_rooms FOR UPDATE TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can update entry banners" ON public.entry_banners;
END $$;
CREATE POLICY "Admin users can update entry banners" ON public.entry_banners FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can update party room backgrounds" ON public.party_room_backgrounds;
END $$;
CREATE POLICY "Admin users can update party room backgrounds" ON public.party_room_backgrounds FOR UPDATE TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can view all party room backgrounds" ON public.party_room_backgrounds;
END $$;
CREATE POLICY "Admin users can view all party room backgrounds" ON public.party_room_backgrounds FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can view all party rooms" ON public.party_rooms;
END $$;
CREATE POLICY "Admin users can view all party rooms" ON public.party_rooms FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can view all task progress" ON public.user_task_progress;
END $$;
CREATE POLICY "Admin users can view all task progress" ON public.user_task_progress FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin view all game transactions" ON public.game_transactions;
END $$;
CREATE POLICY "Admin view all game transactions" ON public.game_transactions FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can add hosts to agencies" ON public.agency_hosts;
END $$;
CREATE POLICY "Admins can add hosts to agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can create logs" ON public.admin_logs;
END $$;
CREATE POLICY "Admins can create logs" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can create replies" ON public.helper_message_replies;
END $$;
CREATE POLICY "Admins can create replies" ON public.helper_message_replies FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete any stream" ON public.live_streams;
END $$;
CREATE POLICY "Admins can delete any stream" ON public.live_streams FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete error logs" ON public.system_error_logs;
END $$;
CREATE POLICY "Admins can delete error logs" ON public.system_error_logs FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete gifts" ON public.gifts;
END $$;
CREATE POLICY "Admins can delete gifts" ON public.gifts FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete helpers" ON public.topup_helpers;
END $$;
CREATE POLICY "Admins can delete helpers" ON public.topup_helpers FOR DELETE TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete trader level tiers" ON public.trader_level_tiers;
END $$;
CREATE POLICY "Admins can delete trader level tiers" ON public.trader_level_tiers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete user level tiers" ON public.user_level_tiers;
END $$;
CREATE POLICY "Admins can delete user level tiers" ON public.user_level_tiers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert branding settings" ON public.branding_settings;
END $$;
CREATE POLICY "Admins can insert branding settings" ON public.branding_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert gift logs" ON public.gift_transaction_logs;
END $$;
CREATE POLICY "Admins can insert gift logs" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert gifts" ON public.gifts;
END $$;
CREATE POLICY "Admins can insert gifts" ON public.gifts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert helpers" ON public.topup_helpers;
END $$;
CREATE POLICY "Admins can insert helpers" ON public.topup_helpers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert reward history" ON public.leaderboard_reward_history;
END $$;
CREATE POLICY "Admins can insert reward history" ON public.leaderboard_reward_history FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert trader level tiers" ON public.trader_level_tiers;
END $$;
CREATE POLICY "Admins can insert trader level tiers" ON public.trader_level_tiers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert user level tiers" ON public.user_level_tiers;
END $$;
CREATE POLICY "Admins can insert user level tiers" ON public.user_level_tiers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage PK banners" ON public.pk_reward_banners;
END $$;
CREATE POLICY "Admins can manage PK banners" ON public.pk_reward_banners TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all agency withdrawals" ON public.agency_withdrawals;
END $$;
CREATE POLICY "Admins can manage all agency withdrawals" ON public.agency_withdrawals TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all bans" ON public.live_bans;
END $$;
CREATE POLICY "Admins can manage all bans" ON public.live_bans TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all helper notifications" ON public.helper_notifications;
END $$;
CREATE POLICY "Admins can manage all helper notifications" ON public.helper_notifications TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all helper payment methods" ON public.helper_country_payment_methods;
END $$;
CREATE POLICY "Admins can manage all helper payment methods" ON public.helper_country_payment_methods TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all helper withdrawals" ON public.helper_withdrawal_requests;
END $$;
CREATE POLICY "Admins can manage all helper withdrawals" ON public.helper_withdrawal_requests TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all orders" ON public.helper_orders;
END $$;
CREATE POLICY "Admins can manage all orders" ON public.helper_orders TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all role frame assignments" ON public.user_role_frames;
END $$;
CREATE POLICY "Admins can manage all role frame assignments" ON public.user_role_frames TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all violations" ON public.live_violations;
END $$;
CREATE POLICY "Admins can manage all violations" ON public.live_violations TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage animations" ON public.level_animations;
END $$;
CREATE POLICY "Admins can manage animations" ON public.level_animations TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage audio tracks" ON public.content_audio_tracks;
END $$;
CREATE POLICY "Admins can manage audio tracks" ON public.content_audio_tracks TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
END $$;
CREATE POLICY "Admins can manage banners" ON public.banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage blocked IPs" ON public.blocked_ips;
END $$;
CREATE POLICY "Admins can manage blocked IPs" ON public.blocked_ips TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage cashback history" ON public.consumption_return_history;
END $$;
CREATE POLICY "Admins can manage cashback history" ON public.consumption_return_history USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage cashback tiers" ON public.consumption_return_config;
END $$;
CREATE POLICY "Admins can manage cashback tiers" ON public.consumption_return_config USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
END $$;
CREATE POLICY "Admins can manage categories" ON public.categories TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage channels" ON public.channels;
END $$;
CREATE POLICY "Admins can manage channels" ON public.channels TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage contact violations" ON public.host_contact_violations;
END $$;
CREATE POLICY "Admins can manage contact violations" ON public.host_contact_violations TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage content" ON public.site_content;
END $$;
CREATE POLICY "Admins can manage content" ON public.site_content TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage currency rates" ON public.currency_rates;
END $$;
CREATE POLICY "Admins can manage currency rates" ON public.currency_rates TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage entertainment" ON public.entertainment;
END $$;
CREATE POLICY "Admins can manage entertainment" ON public.entertainment TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage entry name bars" ON public.entry_name_bars;
END $$;
CREATE POLICY "Admins can manage entry name bars" ON public.entry_name_bars TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage exchange tiers" ON public.user_beans_exchange_tiers;
END $$;
CREATE POLICY "Admins can manage exchange tiers" ON public.user_beans_exchange_tiers TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage first recharge" ON public.first_recharge_bonus;
END $$;
CREATE POLICY "Admins can manage first recharge" ON public.first_recharge_bonus USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage frames" ON public.avatar_frames;
END $$;
CREATE POLICY "Admins can manage frames" ON public.avatar_frames TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage game providers" ON public.game_providers;
END $$;
CREATE POLICY "Admins can manage game providers" ON public.game_providers TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage game server settings" ON public.game_server_settings;
END $$;
CREATE POLICY "Admins can manage game server settings" ON public.game_server_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage helper applications" ON public.helper_applications;
END $$;
CREATE POLICY "Admins can manage helper applications" ON public.helper_applications TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage helper country assignments" ON public.helper_assigned_countries;
END $$;
CREATE POLICY "Admins can manage helper country assignments" ON public.helper_assigned_countries TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage helper diamond packages" ON public.helper_diamond_packages;
END $$;
CREATE POLICY "Admins can manage helper diamond packages" ON public.helper_diamond_packages TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage helper level config" ON public.helper_level_config;
END $$;
CREATE POLICY "Admins can manage helper level config" ON public.helper_level_config TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage helpers" ON public.topup_helpers;
END $$;
CREATE POLICY "Admins can manage helpers" ON public.topup_helpers TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage invitation settings" ON public.invitation_settings;
END $$;
CREATE POLICY "Admins can manage invitation settings" ON public.invitation_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage iptv sources" ON public.iptv_sources;
END $$;
CREATE POLICY "Admins can manage iptv sources" ON public.iptv_sources TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage kids content" ON public.kids_content;
END $$;
CREATE POLICY "Admins can manage kids content" ON public.kids_content TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage landing sections" ON public.landing_page_sections;
END $$;
CREATE POLICY "Admins can manage landing sections" ON public.landing_page_sections TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage level config" ON public.helper_level_config;
END $$;
CREATE POLICY "Admins can manage level config" ON public.helper_level_config TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage login rewards" ON public.daily_login_rewards_config;
END $$;
CREATE POLICY "Admins can manage login rewards" ON public.daily_login_rewards_config USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage movies" ON public.movies;
END $$;
CREATE POLICY "Admins can manage movies" ON public.movies TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage music" ON public.music;
END $$;
CREATE POLICY "Admins can manage music" ON public.music TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage news" ON public.news;
END $$;
CREATE POLICY "Admins can manage news" ON public.news TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage news sources" ON public.news_sources;
END $$;
CREATE POLICY "Admins can manage news sources" ON public.news_sources TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage notification templates" ON public.notification_templates;
END $$;
CREATE POLICY "Admins can manage notification templates" ON public.notification_templates TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage offers" ON public.limited_time_offers;
END $$;
CREATE POLICY "Admins can manage offers" ON public.limited_time_offers USING (public.is_admin(auth.uid()));

-- === RLS Batch 2 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage packages" ON public.coin_packages;
END $$;
CREATE POLICY "Admins can manage packages" ON public.coin_packages TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage payment gateways" ON public.payment_gateways;
END $$;
CREATE POLICY "Admins can manage payment gateways" ON public.payment_gateways TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage penalty tiers" ON public.violation_penalty_tiers;
END $$;
CREATE POLICY "Admins can manage penalty tiers" ON public.violation_penalty_tiers TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage podium frames" ON public.leaderboard_podium_frames;
END $$;
CREATE POLICY "Admins can manage podium frames" ON public.leaderboard_podium_frames TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage popup banners" ON public.popup_event_banners;
END $$;
CREATE POLICY "Admins can manage popup banners" ON public.popup_event_banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage privileges" ON public.level_privileges;
END $$;
CREATE POLICY "Admins can manage privileges" ON public.level_privileges TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage provider logs" ON public.game_provider_logs;
END $$;
CREATE POLICY "Admins can manage provider logs" ON public.game_provider_logs TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage reward config" ON public.leaderboard_reward_config;
END $$;
CREATE POLICY "Admins can manage reward config" ON public.leaderboard_reward_config TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage role frames" ON public.role_frames;
END $$;
CREATE POLICY "Admins can manage role frames" ON public.role_frames TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
END $$;
CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage subtitles" ON public.content_subtitles;
END $$;
CREATE POLICY "Admins can manage subtitles" ON public.content_subtitles TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage tasks" ON public.daily_tasks;
END $$;
CREATE POLICY "Admins can manage tasks" ON public.daily_tasks TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage themes" ON public.app_event_themes;
END $$;
CREATE POLICY "Admins can manage themes" ON public.app_event_themes USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage transactions" ON public.helper_transactions;
END $$;
CREATE POLICY "Admins can manage transactions" ON public.helper_transactions TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage welcome messages" ON public.room_welcome_messages;
END $$;
CREATE POLICY "Admins can manage welcome messages" ON public.room_welcome_messages TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;
END $$;
CREATE POLICY "Admins can read roles" ON public.user_roles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (auth.uid() = user_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can resolve security alerts" ON public.security_alerts;
END $$;
CREATE POLICY "Admins can resolve security alerts" ON public.security_alerts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can send messages to any ticket" ON public.support_messages;
END $$;
CREATE POLICY "Admins can send messages to any ticket" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update agencies" ON public.agencies;
END $$;
CREATE POLICY "Admins can update agencies" ON public.agencies FOR UPDATE USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update all tickets" ON public.support_tickets;
END $$;
CREATE POLICY "Admins can update all tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
END $$;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update any stream" ON public.live_streams;
END $$;
CREATE POLICY "Admins can update any stream" ON public.live_streams FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update error logs" ON public.system_error_logs;
END $$;
CREATE POLICY "Admins can update error logs" ON public.system_error_logs FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update face violations" ON public.live_face_violations;
END $$;
CREATE POLICY "Admins can update face violations" ON public.live_face_violations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update gifts" ON public.gifts;
END $$;
CREATE POLICY "Admins can update gifts" ON public.gifts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update messages" ON public.support_messages;
END $$;
CREATE POLICY "Admins can update messages" ON public.support_messages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update moderation settings" ON public.live_moderation_settings;
END $$;
CREATE POLICY "Admins can update moderation settings" ON public.live_moderation_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update own profile" ON public.admin_users;
END $$;
CREATE POLICY "Admins can update own profile" ON public.admin_users FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update rating claims" ON public.rating_reward_claims;
END $$;
CREATE POLICY "Admins can update rating claims" ON public.rating_reward_claims FOR UPDATE USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update replies" ON public.helper_message_replies;
END $$;
CREATE POLICY "Admins can update replies" ON public.helper_message_replies FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update reports" ON public.user_reports;
END $$;
CREATE POLICY "Admins can update reports" ON public.user_reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update requests" ON public.host_conversion_requests;
END $$;
CREATE POLICY "Admins can update requests" ON public.host_conversion_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update trader level tiers" ON public.trader_level_tiers;
END $$;
CREATE POLICY "Admins can update trader level tiers" ON public.trader_level_tiers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update upgrade requests" ON public.helper_upgrade_requests;
END $$;
CREATE POLICY "Admins can update upgrade requests" ON public.helper_upgrade_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update user level tiers" ON public.user_level_tiers;
END $$;
CREATE POLICY "Admins can update user level tiers" ON public.user_level_tiers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view active sections" ON public.admin_sections;
END $$;
CREATE POLICY "Admins can view active sections" ON public.admin_sections FOR SELECT TO authenticated USING ((public.is_real_user() AND ((is_active = true) OR public.is_admin(auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all applications" ON public.host_applications;
END $$;
CREATE POLICY "Admins can view all applications" ON public.host_applications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'moderator'::public.app_role]))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all claims" ON public.daily_login_claims;
END $$;
CREATE POLICY "Admins can view all claims" ON public.daily_login_claims FOR SELECT USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all coin transfers" ON public.coin_transfers;
END $$;
CREATE POLICY "Admins can view all coin transfers" ON public.coin_transfers FOR SELECT USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all face violations" ON public.live_face_violations;
END $$;
CREATE POLICY "Admins can view all face violations" ON public.live_face_violations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all first recharge claims" ON public.first_recharge_claims;
END $$;
CREATE POLICY "Admins can view all first recharge claims" ON public.first_recharge_claims FOR SELECT USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all gift logs" ON public.gift_transaction_logs;
END $$;
CREATE POLICY "Admins can view all gift logs" ON public.gift_transaction_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all gift transactions" ON public.gift_transactions;
END $$;
CREATE POLICY "Admins can view all gift transactions" ON public.gift_transactions FOR SELECT USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all moderation logs" ON public.chat_moderation_logs;
END $$;
CREATE POLICY "Admins can view all moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
END $$;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all rating claims" ON public.rating_reward_claims;
END $$;
CREATE POLICY "Admins can view all rating claims" ON public.rating_reward_claims FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all replies" ON public.helper_message_replies;
END $$;
CREATE POLICY "Admins can view all replies" ON public.helper_message_replies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all reports" ON public.user_reports;
END $$;
CREATE POLICY "Admins can view all reports" ON public.user_reports FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all requests" ON public.host_conversion_requests;
END $$;
CREATE POLICY "Admins can view all requests" ON public.host_conversion_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all reward history" ON public.leaderboard_reward_history;
END $$;
CREATE POLICY "Admins can view all reward history" ON public.leaderboard_reward_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
END $$;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all streaks" ON public.user_login_streaks;
END $$;
CREATE POLICY "Admins can view all streaks" ON public.user_login_streaks FOR SELECT USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all stream recordings" ON public.stream_recordings;
END $$;
CREATE POLICY "Admins can view all stream recordings" ON public.stream_recordings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all submissions" ON public.face_verification_submissions;
END $$;
CREATE POLICY "Admins can view all submissions" ON public.face_verification_submissions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all topup requests" ON public.helper_topup_requests;
END $$;
CREATE POLICY "Admins can view all topup requests" ON public.helper_topup_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all transactions" ON public.payment_transactions;
END $$;
CREATE POLICY "Admins can view all transactions" ON public.payment_transactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all upgrade requests" ON public.helper_upgrade_requests;
END $$;
CREATE POLICY "Admins can view all upgrade requests" ON public.helper_upgrade_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view audit logs" ON public.security_audit_log;
END $$;
CREATE POLICY "Admins can view audit logs" ON public.security_audit_log FOR SELECT TO authenticated USING (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view devices" ON public.admin_allowed_devices;
END $$;
CREATE POLICY "Admins can view devices" ON public.admin_allowed_devices FOR SELECT TO authenticated USING ((public.is_real_user() AND (public.is_admin(auth.uid()) OR (admin_user_id IN ( SELECT admin_users.id FROM public.admin_users WHERE (admin_users.user_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view login attempts" ON public.login_attempts;
END $$;
CREATE POLICY "Admins can view login attempts" ON public.login_attempts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;
END $$;
CREATE POLICY "Admins can view logs" ON public.admin_logs FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view own permissions" ON public.admin_section_permissions;
END $$;
CREATE POLICY "Admins can view own permissions" ON public.admin_section_permissions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((admin_user_id IN ( SELECT admin_users.id FROM public.admin_users WHERE (admin_users.user_id = auth.uid()))) OR public.is_admin(auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view own record" ON public.admin_users;
END $$;
CREATE POLICY "Admins can view own record" ON public.admin_users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view security alerts" ON public.security_alerts;
END $$;
CREATE POLICY "Admins can view security alerts" ON public.security_alerts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view security logs" ON public.private_call_security_logs;
END $$;
CREATE POLICY "Admins can view security logs" ON public.private_call_security_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view stats" ON public.admin_stats;
END $$;
CREATE POLICY "Admins can view stats" ON public.admin_stats FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view vpn logs" ON public.vpn_detection_logs;
END $$;
CREATE POLICY "Admins can view vpn logs" ON public.vpn_detection_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to claims" ON public.invitation_reward_claims;
END $$;
CREATE POLICY "Admins full access to claims" ON public.invitation_reward_claims TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins manage agency level tiers" ON public.agency_level_tiers;
END $$;
CREATE POLICY "Admins manage agency level tiers" ON public.agency_level_tiers TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins manage all helper withdrawals" ON public.helper_withdrawal_requests;
END $$;
CREATE POLICY "Admins manage all helper withdrawals" ON public.helper_withdrawal_requests TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can create payroll requests" ON public.payroll_requests;
END $$;
CREATE POLICY "Agency owners can create payroll requests" ON public.payroll_requests FOR INSERT TO authenticated WITH CHECK ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can create withdrawal requests" ON public.agency_withdrawals;
END $$;
CREATE POLICY "Agency owners can create withdrawal requests" ON public.agency_withdrawals FOR INSERT TO authenticated WITH CHECK ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can insert transactions" ON public.agency_diamond_transactions;
END $$;
CREATE POLICY "Agency owners can insert transactions" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_diamond_transactions.agency_id) AND (agencies.owner_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can manage sub-agents" ON public.sub_agents;
END $$;
CREATE POLICY "Agency owners can manage sub-agents" ON public.sub_agents TO authenticated USING ((auth.uid() IN ( SELECT agencies.owner_id FROM public.agencies WHERE (agencies.id = sub_agents.agency_id)))) WITH CHECK ((auth.uid() IN ( SELECT agencies.owner_id FROM public.agencies WHERE (agencies.id = sub_agents.agency_id))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view all referrals" ON public.sub_agent_referrals;
END $$;
CREATE POLICY "Agency owners can view all referrals" ON public.sub_agent_referrals FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT a.owner_id FROM (public.agencies a JOIN public.sub_agents sa ON ((sa.agency_id = a.id))) WHERE (sa.id = sub_agent_referrals.sub_agent_id))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their commission history" ON public.agency_commission_history;
END $$;
CREATE POLICY "Agency owners can view their commission history" ON public.agency_commission_history FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_commission_history.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their payroll requests" ON public.payroll_requests;
END $$;
CREATE POLICY "Agency owners can view their payroll requests" ON public.payroll_requests FOR SELECT TO authenticated USING ((agency_id IN ( SELECT agencies.id FROM public.agencies WHERE (agencies.owner_id = auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their transactions" ON public.agency_diamond_transactions;
END $$;
CREATE POLICY "Agency owners can view their transactions" ON public.agency_diamond_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_diamond_transactions.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agency owners can view their transfers" ON public.agency_earnings_transfers;
END $$;
CREATE POLICY "Agency owners can view their transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_earnings_transfers.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow anon to read host applications" ON public.host_applications;
END $$;
CREATE POLICY "Allow anon to read host applications" ON public.host_applications FOR SELECT TO anon USING (true);

-- === RLS Batch 3 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can insert error logs with validation" ON public.system_error_logs;
END $$;
CREATE POLICY "Anon can insert error logs with validation" ON public.system_error_logs FOR INSERT TO anon WITH CHECK (((error_type IS NOT NULL) AND (error_message IS NOT NULL) AND (length(error_message) <= 5000)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active banners" ON public.banners;
END $$;
CREATE POLICY "Anon can view active banners" ON public.banners FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active coin packages" ON public.coin_packages;
END $$;
CREATE POLICY "Anon can view active coin packages" ON public.coin_packages FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active currency rates" ON public.currency_rates;
END $$;
CREATE POLICY "Anon can view active currency rates" ON public.currency_rates FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active game settings" ON public.game_settings;
END $$;
CREATE POLICY "Anon can view active game settings" ON public.game_settings FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active gifts" ON public.gifts;
END $$;
CREATE POLICY "Anon can view active gifts" ON public.gifts FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active popup banners" ON public.popup_event_banners;
END $$;
CREATE POLICY "Anon can view active popup banners" ON public.popup_event_banners FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anon can view active topup payment methods" ON public.topup_payment_methods;
END $$;
CREATE POLICY "Anon can view active topup payment methods" ON public.topup_payment_methods FOR SELECT TO anon USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active audio tracks" ON public.content_audio_tracks;
END $$;
CREATE POLICY "Anyone can read active audio tracks" ON public.content_audio_tracks FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active content" ON public.app_content;
END $$;
CREATE POLICY "Anyone can read active content" ON public.app_content FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active content" ON public.site_content;
END $$;
CREATE POLICY "Anyone can read active content" ON public.site_content FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active offers" ON public.limited_time_offers;
END $$;
CREATE POLICY "Anyone can read active offers" ON public.limited_time_offers FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active parcel templates" ON public.parcel_templates;
END $$;
CREATE POLICY "Anyone can read active parcel templates" ON public.parcel_templates FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read active subtitles" ON public.content_subtitles;
END $$;
CREATE POLICY "Anyone can read active subtitles" ON public.content_subtitles FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
END $$;
CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read app version settings" ON public.app_version_settings;
END $$;
CREATE POLICY "Anyone can read app version settings" ON public.app_version_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read bonus settings" ON public.new_host_live_bonus_settings;
END $$;
CREATE POLICY "Anyone can read bonus settings" ON public.new_host_live_bonus_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read branding settings" ON public.branding_settings;
END $$;
CREATE POLICY "Anyone can read branding settings" ON public.branding_settings FOR SELECT TO anon, authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read consumption return config" ON public.consumption_return_config;
END $$;
CREATE POLICY "Anyone can read consumption return config" ON public.consumption_return_config FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read game providers" ON public.game_providers;
END $$;
CREATE POLICY "Anyone can read game providers" ON public.game_providers FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read host_levels" ON public.host_levels;
END $$;
CREATE POLICY "Anyone can read host_levels" ON public.host_levels FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read icons" ON public.app_icon_registry;
END $$;
CREATE POLICY "Anyone can read icons" ON public.app_icon_registry FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read notification templates" ON public.notification_templates;
END $$;
CREATE POLICY "Anyone can read notification templates" ON public.notification_templates FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read podium frames" ON public.leaderboard_podium_frames;
END $$;
CREATE POLICY "Anyone can read podium frames" ON public.leaderboard_podium_frames FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read provider games" ON public.provider_games;
END $$;
CREATE POLICY "Anyone can read provider games" ON public.provider_games FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read site_settings" ON public.site_settings;
END $$;
CREATE POLICY "Anyone can read site_settings" ON public.site_settings FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read sports" ON public.sports;
END $$;
CREATE POLICY "Anyone can read sports" ON public.sports FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read subscription_plans" ON public.subscription_plans;
END $$;
CREATE POLICY "Anyone can read subscription_plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read themes" ON public.app_event_themes;
END $$;
CREATE POLICY "Anyone can read themes" ON public.app_event_themes FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read youtube_sources" ON public.youtube_sources;
END $$;
CREATE POLICY "Anyone can read youtube_sources" ON public.youtube_sources FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK battle gifts" ON public.pk_battle_gifts;
END $$;
CREATE POLICY "Anyone can view PK battle gifts" ON public.pk_battle_gifts FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK battles" ON public.pk_battles;
END $$;
CREATE POLICY "Anyone can view PK battles" ON public.pk_battles FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK competition rewards" ON public.pk_competition_rewards;
END $$;
CREATE POLICY "Anyone can view PK competition rewards" ON public.pk_competition_rewards FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view PK participants" ON public.pk_participants;
END $$;
CREATE POLICY "Anyone can view PK participants" ON public.pk_participants FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active PK banners" ON public.pk_reward_banners;
END $$;
CREATE POLICY "Anyone can view active PK banners" ON public.pk_reward_banners FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active PK competitions" ON public.pk_competitions;
END $$;
CREATE POLICY "Anyone can view active PK competitions" ON public.pk_competitions FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active VIP exclusive items" ON public.vip_exclusive_items;
END $$;
CREATE POLICY "Anyone can view active VIP exclusive items" ON public.vip_exclusive_items FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active VIP tiers" ON public.vip_tiers;
END $$;
CREATE POLICY "Anyone can view active VIP tiers" ON public.vip_tiers FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active animations" ON public.level_animations;
END $$;
CREATE POLICY "Anyone can view active animations" ON public.level_animations FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active ar stickers" ON public.ar_stickers;
END $$;
CREATE POLICY "Anyone can view active ar stickers" ON public.ar_stickers FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active backgrounds" ON public.party_room_backgrounds;
END $$;
CREATE POLICY "Anyone can view active backgrounds" ON public.party_room_backgrounds FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banners;
END $$;
CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active beauty filters" ON public.beauty_filters;
END $$;
CREATE POLICY "Anyone can view active beauty filters" ON public.beauty_filters FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
END $$;
CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active channels" ON public.channels;
END $$;
CREATE POLICY "Anyone can view active channels" ON public.channels FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active comments" ON public.reel_comments;
END $$;
CREATE POLICY "Anyone can view active comments" ON public.reel_comments FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active entertainment" ON public.entertainment;
END $$;
CREATE POLICY "Anyone can view active entertainment" ON public.entertainment FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active entry banners" ON public.entry_banners;
END $$;
CREATE POLICY "Anyone can view active entry banners" ON public.entry_banners FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active entry name bars" ON public.entry_name_bars;
END $$;
CREATE POLICY "Anyone can view active entry name bars" ON public.entry_name_bars FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active games" ON public.game_configs;
END $$;
CREATE POLICY "Anyone can view active games" ON public.game_configs FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active games" ON public.game_settings;
END $$;
CREATE POLICY "Anyone can view active games" ON public.game_settings FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active gifts" ON public.gifts;
END $$;
CREATE POLICY "Anyone can view active gifts" ON public.gifts FOR SELECT TO authenticated USING (((is_active = true) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active groups" ON public.groups;
END $$;
CREATE POLICY "Anyone can view active groups" ON public.groups FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active helper payment methods" ON public.helper_country_payment_methods;
END $$;
CREATE POLICY "Anyone can view active helper payment methods" ON public.helper_country_payment_methods FOR SELECT TO authenticated USING (((is_active = true) OR (helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active helper payment methods legacy" ON public.helper_payment_methods;
END $$;
CREATE POLICY "Anyone can view active helper payment methods legacy" ON public.helper_payment_methods FOR SELECT TO authenticated USING (((is_active = true) OR (helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active helpers" ON public.topup_helpers;
END $$;
CREATE POLICY "Anyone can view active helpers" ON public.topup_helpers FOR SELECT TO authenticated USING (((is_active = true) AND (is_verified = true)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active invitation settings" ON public.invitation_settings;
END $$;
CREATE POLICY "Anyone can view active invitation settings" ON public.invitation_settings FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active iptv sources" ON public.iptv_sources;
END $$;
CREATE POLICY "Anyone can view active iptv sources" ON public.iptv_sources FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active kids content" ON public.kids_content;
END $$;
CREATE POLICY "Anyone can view active kids content" ON public.kids_content FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active landing sections" ON public.landing_page_sections;
END $$;
CREATE POLICY "Anyone can view active landing sections" ON public.landing_page_sections FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active links" ON public.allowed_external_links;
END $$;
CREATE POLICY "Anyone can view active links" ON public.allowed_external_links FOR SELECT USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active movies" ON public.movies;
END $$;
CREATE POLICY "Anyone can view active movies" ON public.movies FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active music" ON public.music;
END $$;
CREATE POLICY "Anyone can view active music" ON public.music FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active news" ON public.news;
END $$;
CREATE POLICY "Anyone can view active news" ON public.news FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active offers" ON public.limited_time_offers;
END $$;
CREATE POLICY "Anyone can view active offers" ON public.limited_time_offers FOR SELECT USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active packages" ON public.coin_packages;
END $$;
CREATE POLICY "Anyone can view active packages" ON public.coin_packages FOR SELECT TO authenticated USING ((public.is_real_user() AND (is_active = true)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active party rooms" ON public.party_rooms;
END $$;
CREATE POLICY "Anyone can view active party rooms" ON public.party_rooms FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active payment gateways" ON public.payment_gateways;
END $$;
CREATE POLICY "Anyone can view active payment gateways" ON public.payment_gateways FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active payment methods" ON public.topup_payment_methods;
END $$;
CREATE POLICY "Anyone can view active payment methods" ON public.topup_payment_methods FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active plans" ON public.subscription_plans;
END $$;
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active policies" ON public.agency_policy_settings;
END $$;
CREATE POLICY "Anyone can view active policies" ON public.agency_policy_settings FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active popup banners" ON public.popup_event_banners;
END $$;
CREATE POLICY "Anyone can view active popup banners" ON public.popup_event_banners FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active privileges" ON public.level_privileges;
END $$;
CREATE POLICY "Anyone can view active privileges" ON public.level_privileges FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active reel categories" ON public.reel_categories;
END $$;
CREATE POLICY "Anyone can view active reel categories" ON public.reel_categories FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active sports" ON public.sports;
END $$;
CREATE POLICY "Anyone can view active sports" ON public.sports FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active streams" ON public.live_streams;
END $$;
CREATE POLICY "Anyone can view active streams" ON public.live_streams FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active tasks" ON public.daily_tasks;
END $$;
CREATE POLICY "Anyone can view active tasks" ON public.daily_tasks FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view active welcome messages" ON public.room_welcome_messages;
END $$;
CREATE POLICY "Anyone can view active welcome messages" ON public.room_welcome_messages FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view admin music" ON public.admin_music_library;
END $$;
CREATE POLICY "Anyone can view admin music" ON public.admin_music_library FOR SELECT TO authenticated USING ((is_active = true));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view agency level tiers" ON public.agency_level_tiers;
END $$;
CREATE POLICY "Anyone can view agency level tiers" ON public.agency_level_tiers FOR SELECT TO authenticated USING (true);