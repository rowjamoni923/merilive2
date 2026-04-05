-- RLS Safe Migration Batch 6

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can insert own violations" ON public.host_contact_violations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can insert own violations" ON public.host_contact_violations FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can read allowed links" ON public.allowed_external_links;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can read allowed links" ON public.allowed_external_links FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view all banners" ON public.party_room_banners;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view all banners" ON public.party_room_banners FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view all bets" ON public.game_bets;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view all bets" ON public.game_bets FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view all games" ON public.game_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view all games" ON public.game_settings FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view errors" ON public.system_error_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view errors" ON public.system_error_logs FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view game stats" ON public.game_stats;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view game stats" ON public.game_stats FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view non-blocked profiles" ON public.profiles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view non-blocked profiles" ON public.profiles FOR SELECT USING (((auth.uid() IS NOT NULL) AND (is_blocked = false)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can view own violations" ON public.host_contact_violations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated can view own violations" ON public.host_contact_violations FOR SELECT TO authenticated USING (((auth.uid() = host_id) OR public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can chat" ON public.stream_chat;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can chat" ON public.stream_chat FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can comment" ON public.reel_comments;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can comment" ON public.reel_comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create PK battles" ON public.pk_battles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can create PK battles" ON public.pk_battles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = challenger_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create alerts" ON public.security_alerts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can create alerts" ON public.security_alerts FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON public.game_sessions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can create game sessions" ON public.game_sessions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = game_sessions.room_id) AND (party_rooms.host_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create party rooms" ON public.party_rooms;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can create party rooms" ON public.party_rooms FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can insert moderation logs" ON public.chat_moderation_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can insert moderation logs" ON public.chat_moderation_logs FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can like reels" ON public.reel_likes;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can like reels" ON public.reel_likes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can log attempts" ON public.login_attempts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can log attempts" ON public.login_attempts FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can log errors" ON public.system_error_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can log errors" ON public.system_error_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can manage icons" ON public.app_icon_registry;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can manage icons" ON public.app_icon_registry TO authenticated USING (true) WITH CHECK (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can place bets" ON public.game_bets;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can place bets" ON public.game_bets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can read game server settings" ON public.game_server_settings;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can read game server settings" ON public.game_server_settings FOR SELECT TO authenticated USING ((auth.role() = ''authenticated''::text));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can report reels" ON public.reel_reports;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can report reels" ON public.reel_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can send PK gifts" ON public.pk_battle_gifts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can send PK gifts" ON public.pk_battle_gifts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.party_room_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can send messages" ON public.party_room_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND ((EXISTS ( SELECT 1 FROM public.party_room_participants WHERE ((party_room_participants.room_id = party_room_messages.room_id) AND (party_room_participants.user_id = auth.uid()) AND (party_room_participants.left_at IS NULL)))) OR (EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = party_room_messages.room_id) AND (party_rooms.host_id = auth.uid())))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can share reels" ON public.reel_shares;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can share reels" ON public.reel_shares FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view active role frames" ON public.role_frames;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can view active role frames" ON public.role_frames FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view agencies" ON public.agencies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can view agencies" ON public.agencies FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.helper_admin_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can view all messages" ON public.helper_admin_messages FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view all payment methods" ON public.topup_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can view all payment methods" ON public.topup_payment_methods FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Call participants can view events" ON public.call_events;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Call participants can view events" ON public.call_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.private_calls WHERE ((private_calls.id = call_events.call_id) AND ((private_calls.caller_id = auth.uid()) OR (private_calls.host_id = auth.uid()))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Deny all direct access to OTPs" ON public.password_reset_otps;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Deny all direct access to OTPs" ON public.password_reset_otps TO authenticated USING (false) WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Everyone can view active exchange tiers" ON public.user_beans_exchange_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Everyone can view active exchange tiers" ON public.user_beans_exchange_tiers FOR SELECT TO authenticated USING ((is_active = true));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Everyone can view trader level tiers" ON public.trader_level_tiers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Everyone can view trader level tiers" ON public.trader_level_tiers FOR SELECT TO authenticated USING (true);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Guest users can update own online status" ON public.profiles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Guest users can update own online status" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers and admins can insert messages" ON public.helper_admin_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers and admins can insert messages" ON public.helper_admin_messages FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.is_active = true))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create replies" ON public.helper_message_replies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can create replies" ON public.helper_message_replies FOR INSERT TO authenticated WITH CHECK (((sender_type = ''helper''::text) AND (sender_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM (public.helper_admin_messages ham JOIN public.topup_helpers th ON ((ham.helper_id = th.id))) WHERE ((ham.id = helper_message_replies.message_id) AND (th.user_id = auth.uid()))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create topup requests" ON public.helper_topup_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can create topup requests" ON public.helper_topup_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create transactions" ON public.helper_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can create transactions" ON public.helper_transactions FOR INSERT TO authenticated WITH CHECK ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can create upgrade requests" ON public.helper_upgrade_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can create upgrade requests" ON public.helper_upgrade_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can delete their own payment methods" ON public.helper_country_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can delete their own payment methods" ON public.helper_country_payment_methods FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can insert their own payment methods" ON public.helper_country_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can insert their own payment methods" ON public.helper_country_payment_methods FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5) AND (topup_helpers.payroll_enabled = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can manage own payment methods" ON public.helper_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can manage own payment methods" ON public.helper_payment_methods TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can mark their messages as read" ON public.helper_admin_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can mark their messages as read" ON public.helper_admin_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_admin_messages.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update limited own data" ON public.topup_helpers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can update limited own data" ON public.topup_helpers FOR UPDATE TO authenticated USING ((user_id = auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_withdrawal_requests.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update own notifications" ON public.helper_notifications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can update own notifications" ON public.helper_notifications FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_notifications.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update their orders" ON public.helper_orders;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can update their orders" ON public.helper_orders FOR UPDATE TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can update their own payment methods" ON public.helper_country_payment_methods;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can update their own payment methods" ON public.helper_country_payment_methods FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_country_payment_methods.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_withdrawal_requests.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view own data" ON public.topup_helpers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view own data" ON public.topup_helpers FOR SELECT TO authenticated USING ((user_id = auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view own notifications" ON public.helper_notifications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view own notifications" ON public.helper_notifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_notifications.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view own transactions" ON public.helper_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view own transactions" ON public.helper_transactions FOR SELECT TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view replies on their messages" ON public.helper_message_replies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view replies on their messages" ON public.helper_message_replies FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM (public.helper_admin_messages ham JOIN public.topup_helpers th ON ((ham.helper_id = th.id))) WHERE ((ham.id = helper_message_replies.message_id) AND (th.user_id = auth.uid())))) OR (sender_id = auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;
