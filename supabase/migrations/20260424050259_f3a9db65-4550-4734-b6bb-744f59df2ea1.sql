-- RLS policies — Chunk 1 of 16 — schema-validated, dangerous policies excluded
DROP POLICY IF EXISTS "Authenticated can check lockout status" ON public.account_lockouts;
CREATE POLICY "Authenticated can check lockout status" ON public.account_lockouts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "System can manage lockouts" ON public.account_lockouts;
CREATE POLICY "System can manage lockouts" ON public.account_lockouts TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view devices" ON public.admin_allowed_devices;
CREATE POLICY "Admins can view devices" ON public.admin_allowed_devices FOR SELECT TO authenticated USING ((public.is_real_user() AND (public.is_admin(auth.uid()) OR (admin_user_id IN ( SELECT admin_users.id FROM public.admin_users WHERE (admin_users.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Only admins can register devices" ON public.admin_allowed_devices;
CREATE POLICY "Only admins can register devices" ON public.admin_allowed_devices FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage all devices" ON public.admin_allowed_devices;
CREATE POLICY "Owners can manage all devices" ON public.admin_allowed_devices TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can manage invitations" ON public.admin_invitations;
CREATE POLICY "Owners can manage invitations" ON public.admin_invitations TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "No public access to admin_login_otps" ON public.admin_login_otps;
CREATE POLICY "No public access to admin_login_otps" ON public.admin_login_otps TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Admins can create logs" ON public.admin_logs;
CREATE POLICY "Admins can create logs" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;
CREATE POLICY "Admins can view logs" ON public.admin_logs FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
CREATE POLICY "No direct admin_logs deletes" ON public.admin_logs FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
CREATE POLICY "No direct admin_logs inserts" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
CREATE POLICY "No direct admin_logs updates" ON public.admin_logs FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "Anyone can view admin music" ON public.admin_music_library;
CREATE POLICY "Anyone can view admin music" ON public.admin_music_library FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Only admins can manage music" ON public.admin_music_library;
CREATE POLICY "Only admins can manage music" ON public.admin_music_library TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage notices" ON public.admin_notices;
CREATE POLICY "Only admins can manage notices" ON public.admin_notices TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Users can read active notices" ON public.admin_notices;
CREATE POLICY "Users can read active notices" ON public.admin_notices FOR SELECT TO authenticated USING ((public.is_real_user() AND ((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())))));

DROP POLICY IF EXISTS "Admins can view own permissions" ON public.admin_section_permissions;
CREATE POLICY "Admins can view own permissions" ON public.admin_section_permissions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((admin_user_id IN ( SELECT admin_users.id FROM public.admin_users WHERE (admin_users.user_id = auth.uid()))) OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
CREATE POLICY "No direct perm deletes" ON public.admin_section_permissions FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
CREATE POLICY "No direct perm inserts" ON public.admin_section_permissions FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
CREATE POLICY "No direct perm updates" ON public.admin_section_permissions FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "Owners can manage permissions" ON public.admin_section_permissions;
CREATE POLICY "Owners can manage permissions" ON public.admin_section_permissions TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Admins can view active sections" ON public.admin_sections;
CREATE POLICY "Admins can view active sections" ON public.admin_sections FOR SELECT TO authenticated USING ((public.is_real_user() AND ((is_active = true) OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "Owners can manage sections" ON public.admin_sections;
CREATE POLICY "Owners can manage sections" ON public.admin_sections TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Admins can view stats" ON public.admin_stats;
CREATE POLICY "Admins can view stats" ON public.admin_stats FOR SELECT TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Admins can update own profile" ON public.admin_users;
CREATE POLICY "Admins can update own profile" ON public.admin_users FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can view own record" ON public.admin_users;
CREATE POLICY "Admins can view own record" ON public.admin_users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
CREATE POLICY "No direct admin deletes" ON public.admin_users FOR DELETE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
CREATE POLICY "No direct admin inserts" ON public.admin_users FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
CREATE POLICY "No direct admin updates" ON public.admin_users FOR UPDATE TO authenticated USING ((public.is_real_user() AND false));

DROP POLICY IF EXISTS "Owners can manage all admin users" ON public.admin_users;
CREATE POLICY "Owners can manage all admin users" ON public.admin_users TO authenticated USING ((public.is_real_user() AND public.is_admin(auth.uid()))) WITH CHECK ((public.is_real_user() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Admins can update agencies" ON public.agencies;
CREATE POLICY "Admins can update agencies" ON public.agencies FOR UPDATE USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view agencies" ON public.agencies;
CREATE POLICY "Authenticated users can view agencies" ON public.agencies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "No direct agency deletes" ON public.agencies;
CREATE POLICY "No direct agency deletes" ON public.agencies FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "Owners can update own agency stats" ON public.agencies;
CREATE POLICY "Owners can update own agency stats" ON public.agencies FOR UPDATE USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));

DROP POLICY IF EXISTS "Users can create own agency or admins" ON public.agencies;
CREATE POLICY "Users can create own agency or admins" ON public.agencies FOR INSERT TO authenticated WITH CHECK (((auth.uid() = owner_id) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Agency owners can view their commission history" ON public.agency_commission_history;
CREATE POLICY "Agency owners can view their commission history" ON public.agency_commission_history FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_commission_history.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "Agency owners can insert transactions" ON public.agency_diamond_transactions;
CREATE POLICY "Agency owners can insert transactions" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_diamond_transactions.agency_id) AND (agencies.owner_id = auth.uid())))));

DROP POLICY IF EXISTS "Agency owners can view their transactions" ON public.agency_diamond_transactions;
CREATE POLICY "Agency owners can view their transactions" ON public.agency_diamond_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_diamond_transactions.agency_id) AND (agencies.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))));

DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
CREATE POLICY "No direct agency diamond inserts" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK (false);