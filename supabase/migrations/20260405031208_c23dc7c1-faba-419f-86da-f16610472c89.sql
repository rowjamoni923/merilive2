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
  EXECUTE 'CREATE POLICY "Admins can create replies" ON public.helper_message_replies FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete agency hosts" ON public.agency_hosts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete agency hosts" ON public.agency_hosts FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can insert agency data" ON public.agencies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can insert agency data" ON public.agencies FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));';
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
  DROP POLICY IF EXISTS "Admins can manage app content" ON public.app_content;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage app content" ON public.app_content USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage avatar frames" ON public.avatar_frames;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage avatar frames" ON public.avatar_frames USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage banners" ON public.banners USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage coin packages" ON public.coin_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage coin packages" ON public.coin_packages USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage daily tasks" ON public.daily_tasks;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage daily tasks" ON public.daily_tasks USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage entry name bars" ON public.entry_name_bars;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage entry name bars" ON public.entry_name_bars USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage level privileges" ON public.level_privileges;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage level privileges" ON public.level_privileges USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage music library" ON public.admin_music_library;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage music library" ON public.admin_music_library USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage notices" ON public.admin_notices;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage notices" ON public.admin_notices USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage payment methods" ON public.payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage payment methods" ON public.payment_methods USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage reward config" ON public.daily_login_rewards_config;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage reward config" ON public.daily_login_rewards_config USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage version settings" ON public.app_version_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can manage version settings" ON public.app_version_settings USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can read all moderation logs" ON public.chat_moderation_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can read all moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update agency data" ON public.agencies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update agency data" ON public.agencies FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update agency hosts" ON public.agency_hosts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update agency hosts" ON public.agency_hosts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update gifts" ON public.gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can update gifts" ON public.gifts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view agency hosts" ON public.agency_hosts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view agency hosts" ON public.agency_hosts FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all agencies" ON public.agencies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all agencies" ON public.agencies FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
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
  DROP POLICY IF EXISTS "Admins can view all withdrawals" ON public.agency_withdrawals;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all withdrawals" ON public.agency_withdrawals FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view face records" ON public.face_records;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view face records" ON public.face_records FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view logs" ON public.admin_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view stats" ON public.admin_stats;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view stats" ON public.admin_stats FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to admin_users" ON public.admin_users;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins full access to admin_users" ON public.admin_users USING (public.is_admin(auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins full access to host_applications" ON public.host_applications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins full access to host_applications" ON public.host_applications USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;