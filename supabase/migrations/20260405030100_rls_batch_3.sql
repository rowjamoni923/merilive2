-- RLS Safe Migration Batch 1

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can manage bonus settings" ON public.new_host_live_bonus_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin can manage bonus settings" ON public.new_host_live_bonus_settings TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all bonus progress" ON public.new_host_live_bonus_progress;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin can read all bonus progress" ON public.new_host_live_bonus_progress FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can view all claims" ON public.parcel_claims;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin can view all claims" ON public.parcel_claims FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can view all parcels" ON public.user_parcels;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin can view all parcels" ON public.user_parcels FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can view all private calls" ON public.private_calls;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin can view all private calls" ON public.private_calls FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access ar_stickers" ON public.ar_stickers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin full access ar_stickers" ON public.ar_stickers USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access beauty_filters" ON public.beauty_filters;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin full access beauty_filters" ON public.beauty_filters USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access game_configs" ON public.game_configs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin full access game_configs" ON public.game_configs USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin full access to parcel templates" ON public.parcel_templates;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin full access to parcel templates" ON public.parcel_templates TO authenticated USING (true) WITH CHECK (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can delete entry banners" ON public.entry_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can delete entry banners" ON public.entry_banners FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can delete party room backgrounds" ON public.party_room_backgrounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can delete party room backgrounds" ON public.party_room_backgrounds FOR DELETE TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can insert entry banners" ON public.entry_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can insert entry banners" ON public.entry_banners FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can insert party room backgrounds" ON public.party_room_backgrounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can insert party room backgrounds" ON public.party_room_backgrounds FOR INSERT TO authenticated WITH CHECK ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can update any party room" ON public.party_rooms;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can update any party room" ON public.party_rooms FOR UPDATE TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can update entry banners" ON public.entry_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can update entry banners" ON public.entry_banners FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can update party room backgrounds" ON public.party_room_backgrounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can update party room backgrounds" ON public.party_room_backgrounds FOR UPDATE TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can view all party room backgrounds" ON public.party_room_backgrounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can view all party room backgrounds" ON public.party_room_backgrounds FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can view all party rooms" ON public.party_rooms;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can view all party rooms" ON public.party_rooms FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT au.user_id FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin users can view all task progress" ON public.user_task_progress;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin users can view all task progress" ON public.user_task_progress FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin view all game transactions" ON public.game_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admin view all game transactions" ON public.game_transactions FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can add hosts to agencies" ON public.agency_hosts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can add hosts to agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can create logs" ON public.admin_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can create logs" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can create replies" ON public.helper_message_replies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can create replies" ON public.helper_message_replies FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete any stream" ON public.live_streams;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete any stream" ON public.live_streams FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete error logs" ON public.system_error_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete error logs" ON public.system_error_logs FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete gifts" ON public.gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete gifts" ON public.gifts FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete helpers" ON public.topup_helpers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete helpers" ON public.topup_helpers FOR DELETE TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete trader level tiers" ON public.trader_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete trader level tiers" ON public.trader_level_tiers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete user level tiers" ON public.user_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete user level tiers" ON public.user_level_tiers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert branding settings" ON public.branding_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert branding settings" ON public.branding_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert gift logs" ON public.gift_transaction_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert gift logs" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert gifts" ON public.gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert gifts" ON public.gifts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert helpers" ON public.topup_helpers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert helpers" ON public.topup_helpers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert reward history" ON public.leaderboard_reward_history;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert reward history" ON public.leaderboard_reward_history FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert trader level tiers" ON public.trader_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert trader level tiers" ON public.trader_level_tiers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert user level tiers" ON public.user_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert user level tiers" ON public.user_level_tiers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage PK banners" ON public.pk_reward_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage PK banners" ON public.pk_reward_banners TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all agency withdrawals" ON public.agency_withdrawals;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all agency withdrawals" ON public.agency_withdrawals TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all bans" ON public.live_bans;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all bans" ON public.live_bans TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all helper notifications" ON public.helper_notifications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all helper notifications" ON public.helper_notifications TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all helper payment methods" ON public.helper_country_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all helper payment methods" ON public.helper_country_payment_methods TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all helper withdrawals" ON public.helper_withdrawal_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all helper withdrawals" ON public.helper_withdrawal_requests TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all orders" ON public.helper_orders;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all orders" ON public.helper_orders TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all role frame assignments" ON public.user_role_frames;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all role frame assignments" ON public.user_role_frames TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all violations" ON public.live_violations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage all violations" ON public.live_violations TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage animations" ON public.level_animations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage animations" ON public.level_animations TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage audio tracks" ON public.content_audio_tracks;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage audio tracks" ON public.content_audio_tracks TO authenticated USING ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ''admin''::public.app_role)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage banners" ON public.banners TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage blocked IPs" ON public.blocked_ips;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage blocked IPs" ON public.blocked_ips TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage cashback history" ON public.consumption_return_history;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage cashback history" ON public.consumption_return_history USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage cashback tiers" ON public.consumption_return_config;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage cashback tiers" ON public.consumption_return_config USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage categories" ON public.categories TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage channels" ON public.channels;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage channels" ON public.channels TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage contact violations" ON public.host_contact_violations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage contact violations" ON public.host_contact_violations TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage content" ON public.site_content;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage content" ON public.site_content TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;
