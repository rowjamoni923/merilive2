-- RLS Safe Migration Batch 7

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their assigned countries" ON public.helper_assigned_countries;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view their assigned countries" ON public.helper_assigned_countries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_assigned_countries.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their orders" ON public.helper_orders;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view their orders" ON public.helper_orders FOR SELECT TO authenticated USING ((helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their own messages" ON public.helper_admin_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view their own messages" ON public.helper_admin_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.id = helper_admin_messages.helper_id) AND (topup_helpers.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their own topup requests" ON public.helper_topup_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view their own topup requests" ON public.helper_topup_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Helpers can view their own upgrade requests" ON public.helper_upgrade_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Helpers can view their own upgrade requests" ON public.helper_upgrade_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can cancel their own pending requests" ON public.agency_hosts;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can cancel their own pending requests" ON public.agency_hosts FOR DELETE TO authenticated USING (((host_id = auth.uid()) AND (status = ''pending''::text)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can create reels" ON public.reels;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can create reels" ON public.reels FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can create seat invitations" ON public.seat_invitations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can create seat invitations" ON public.seat_invitations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = seat_invitations.room_id) AND (party_rooms.host_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can create streams" ON public.live_streams;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can create streams" ON public.live_streams FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can delete own streams" ON public.live_streams;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can delete own streams" ON public.live_streams FOR DELETE TO authenticated USING ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can delete their invitations" ON public.seat_invitations;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can delete their invitations" ON public.seat_invitations FOR DELETE TO authenticated USING ((host_id = auth.uid()));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can delete their rooms" ON public.party_rooms;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can delete their rooms" ON public.party_rooms FOR DELETE TO authenticated USING ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can update own streams" ON public.live_streams;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can update own streams" ON public.live_streams FOR UPDATE TO authenticated USING ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can update participants in their rooms" ON public.party_room_participants;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can update participants in their rooms" ON public.party_room_participants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = party_room_participants.room_id) AND (party_rooms.host_id = auth.uid()) AND (party_rooms.is_active = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can update their rooms" ON public.party_rooms;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can update their rooms" ON public.party_rooms FOR UPDATE TO authenticated USING ((auth.uid() = host_id));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Hosts can view their own transfers" ON public.agency_earnings_transfers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Hosts can view their own transfers" ON public.agency_earnings_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND (host_id = auth.uid())));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals FOR UPDATE TO authenticated USING ((public.is_real_user() AND (EXISTS ( SELECT 1 FROM (public.topup_helpers th JOIN public.helper_assigned_countries hac ON ((hac.helper_id = th.id))) WHERE ((th.user_id = auth.uid()) AND (th.trader_level = 5) AND (th.payroll_enabled = true) AND (th.is_active = true) AND (hac.country_code = agency_withdrawals.country_code) AND (hac.is_active = true))))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Level 5 traders can update their assigned payroll requests" ON public.payroll_requests FOR UPDATE TO authenticated USING ((trader_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Level 5 traders can view assigned payroll requests" ON public.payroll_requests;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Level 5 traders can view assigned payroll requests" ON public.payroll_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.topup_helpers WHERE ((topup_helpers.user_id = auth.uid()) AND (topup_helpers.trader_level = 5) AND (topup_helpers.payroll_enabled = true) AND (topup_helpers.is_verified = true)))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1 FROM public.group_members gm WHERE ((gm.group_id = group_messages.group_id) AND (gm.user_id = auth.uid())))) AND (auth.uid() = sender_id)));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view group messages" ON public.group_messages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Members can view group messages" ON public.group_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.group_members gm WHERE ((gm.group_id = group_messages.group_id) AND (gm.user_id = auth.uid())))));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct access" ON public.recovery_tokens;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct access" ON public.recovery_tokens FOR SELECT USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct admin deletes" ON public.admin_users FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct admin inserts" ON public.admin_users FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct admin updates" ON public.admin_users FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct admin_logs deletes" ON public.admin_logs FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct admin_logs inserts" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct admin_logs updates" ON public.admin_logs FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct agency deletes" ON public.agencies;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct agency deletes" ON public.agencies FOR DELETE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct agency diamond inserts" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct bet inserts" ON public.live_game_bets;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct bet inserts" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct bet updates" ON public.live_game_bets;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct bet updates" ON public.live_game_bets FOR UPDATE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin transfer inserts" ON public.coin_transfers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct coin transfer inserts" ON public.coin_transfers FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_package deletes" ON public.coin_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct coin_package deletes" ON public.coin_packages FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_package inserts" ON public.coin_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct coin_package inserts" ON public.coin_packages FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_package updates" ON public.coin_packages;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct coin_package updates" ON public.coin_packages FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_transfer deletes" ON public.coin_transfers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct coin_transfer deletes" ON public.coin_transfers FOR DELETE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct coin_transfer updates" ON public.coin_transfers;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct coin_transfer updates" ON public.coin_transfers FOR UPDATE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game deletes" ON public.game_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct game deletes" ON public.game_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game player updates" ON public.game_players;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct game player updates" ON public.game_players FOR UPDATE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game round inserts" ON public.live_game_rounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct game round inserts" ON public.live_game_rounds FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game round updates" ON public.live_game_rounds;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct game round updates" ON public.live_game_rounds FOR UPDATE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game transaction inserts" ON public.game_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct game transaction inserts" ON public.game_transactions FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct game updates" ON public.game_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct game updates" ON public.game_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift deletes" ON public.gift_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct gift deletes" ON public.gift_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift log inserts" ON public.gift_transaction_logs;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct gift log inserts" ON public.gift_transaction_logs FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift transaction inserts" ON public.gift_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct gift transaction inserts" ON public.gift_transactions FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct gift updates" ON public.gift_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct gift updates" ON public.gift_transactions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct notification inserts" ON public.notifications;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct notification inserts" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct performance updates" ON public.agency_performance;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct performance updates" ON public.agency_performance FOR UPDATE TO authenticated USING (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct perm deletes" ON public.admin_section_permissions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct perm inserts" ON public.admin_section_permissions FOR INSERT TO authenticated WITH CHECK (false);';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct perm updates" ON public.admin_section_permissions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct profile deletes" ON public.profiles;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct profile deletes" ON public.profiles FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "No direct recharge deletes" ON public.recharge_transactions;
END $$;
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "No direct recharge deletes" ON public.recharge_transactions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped: %', SQLERRM;
END $safe$;
