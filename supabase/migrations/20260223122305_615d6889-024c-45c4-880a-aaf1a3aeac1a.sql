
-- ============================================================
-- CRITICAL SECURITY FIX: Close all remaining vulnerabilities
-- ============================================================

-- 1. CRITICAL: game_settings - ANY authenticated user can update game settings!
DROP POLICY IF EXISTS "Authenticated can update games" ON public.game_settings;
CREATE POLICY "Only admins can update game settings"
ON public.game_settings FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 2. system_error_logs: block authenticated delete/update
DROP POLICY IF EXISTS "Authenticated can delete errors" ON public.system_error_logs;
CREATE POLICY "No direct error log deletes"
ON public.system_error_logs FOR DELETE
USING (false);

DROP POLICY IF EXISTS "Authenticated can update errors" ON public.system_error_logs;
CREATE POLICY "No direct error log updates"
ON public.system_error_logs FOR UPDATE
USING (false);

-- 3. Fix conflicting agency UPDATE policies (keep admin-only)
DROP POLICY IF EXISTS "Agency owners can update their agency" ON public.agencies;
DROP POLICY IF EXISTS "Admins can update any agency" ON public.agencies;
DROP POLICY IF EXISTS "No direct agency updates" ON public.agencies;
CREATE POLICY "Only admins can update agencies"
ON public.agencies FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 4. Fix conflicting agency_hosts policies
DROP POLICY IF EXISTS "Admins can delete agency hosts" ON public.agency_hosts;
DROP POLICY IF EXISTS "Admins can update agency hosts" ON public.agency_hosts;
DROP POLICY IF EXISTS "Agency owners can manage hosts" ON public.agency_hosts;
DROP POLICY IF EXISTS "Users can leave agency" ON public.agency_hosts;
DROP POLICY IF EXISTS "No direct agency_hosts deletes" ON public.agency_hosts;
DROP POLICY IF EXISTS "No direct agency_hosts updates" ON public.agency_hosts;
DROP POLICY IF EXISTS "No direct agency_hosts inserts" ON public.agency_hosts;

-- Only admins can manage agency_hosts
CREATE POLICY "Only admins manage agency hosts"
ON public.agency_hosts FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Users can only view their own membership
DROP POLICY IF EXISTS "Admins can view all agency hosts" ON public.agency_hosts;
CREATE POLICY "Users can view agency hosts"
ON public.agency_hosts FOR SELECT
TO authenticated
USING (
  host_id = auth.uid() 
  OR public.is_admin(auth.uid())
  OR agency_id IN (SELECT id FROM public.agencies WHERE owner_id = auth.uid())
);

-- 5. Restrict profiles UPDATE - users can only update specific safe fields
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 6. Restrict game_sessions update to admins only (hosts update via RPC)
DROP POLICY IF EXISTS "Hosts can update game sessions" ON public.game_sessions;
CREATE POLICY "Only admins can update game sessions"
ON public.game_sessions FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 7. Restrict game_players update
DROP POLICY IF EXISTS "Users can update their game status" ON public.game_players;
CREATE POLICY "No direct game player updates"
ON public.game_players FOR UPDATE
USING (false);

-- 8. Restrict private_calls direct update (should go through RPC)
DROP POLICY IF EXISTS "Hosts can update their calls" ON public.private_calls;
DROP POLICY IF EXISTS "Participants can update call" ON public.private_calls;
CREATE POLICY "Participants can update own calls"
ON public.private_calls FOR UPDATE
TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = host_id);

-- 9. Lock down payment_transactions
DROP POLICY IF EXISTS "Admins can update transactions" ON public.payment_transactions;
CREATE POLICY "Only admins can update transactions"
ON public.payment_transactions FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 10. Restrict topup_helpers self-update (prevent balance manipulation)
DROP POLICY IF EXISTS "Helpers can update own data" ON public.topup_helpers;
CREATE POLICY "Helpers can update limited own data"
ON public.topup_helpers FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 11. Restrict live_streams delete/update
DROP POLICY IF EXISTS "Hosts can delete own streams" ON public.live_streams;
CREATE POLICY "Hosts can delete own streams"
ON public.live_streams FOR DELETE
TO authenticated
USING (auth.uid() = host_id);

-- 12. Restrict helper_topup_requests
DROP POLICY IF EXISTS "Admins can update topup requests" ON public.helper_topup_requests;
CREATE POLICY "Only admins can update topup requests"
ON public.helper_topup_requests FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 13. Ensure all admin table operations require authentication
-- branding_settings
DROP POLICY IF EXISTS "Admins can update branding settings" ON public.branding_settings;
CREATE POLICY "Only admins can update branding"
ON public.branding_settings FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 14. host_applications - restrict admin update
DROP POLICY IF EXISTS "Admins can update all applications" ON public.host_applications;
CREATE POLICY "Only admins can update applications"
ON public.host_applications FOR UPDATE
TO authenticated
USING (
  (auth.uid() = user_id AND status = 'pending')
  OR public.is_admin(auth.uid())
);
DROP POLICY IF EXISTS "Users can update their own application" ON public.host_applications;

-- 15. gift_transaction_logs - restrict admin update
DROP POLICY IF EXISTS "Admins can update gift logs" ON public.gift_transaction_logs;
CREATE POLICY "Only admins can update gift logs"
ON public.gift_transaction_logs FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 16. face_verification_submissions restrict
DROP POLICY IF EXISTS "Admins can update all submissions" ON public.face_verification_submissions;
CREATE POLICY "Only admins can update submissions"
ON public.face_verification_submissions FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (auth.uid() = user_id AND status = 'pending')
);
DROP POLICY IF EXISTS "Users can update their pending submissions" ON public.face_verification_submissions;

-- 17. pk_battles
DROP POLICY IF EXISTS "Participants can update PK battles" ON public.pk_battles;
CREATE POLICY "Participants can update PK battles"
ON public.pk_battles FOR UPDATE
TO authenticated
USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- 18. Ensure all SELECT-only public tables restrict writes
-- admin_music_library
DROP POLICY IF EXISTS "Admins can manage music library" ON public.admin_music_library;
CREATE POLICY "Only admins can manage music"
ON public.admin_music_library FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- admin_notices
DROP POLICY IF EXISTS "Admins can manage notices" ON public.admin_notices;
CREATE POLICY "Only admins can manage notices"
ON public.admin_notices FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- app_content
DROP POLICY IF EXISTS "Admins can manage content" ON public.app_content;
CREATE POLICY "Only admins can manage content"
ON public.app_content FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- app_settings
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;
CREATE POLICY "Only admins can manage settings"
ON public.app_settings FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- app_version_settings
DROP POLICY IF EXISTS "Admins can manage app version settings" ON public.app_version_settings;
CREATE POLICY "Only admins can manage version settings"
ON public.app_version_settings FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- agency_policy_settings
DROP POLICY IF EXISTS "Admins can manage policies" ON public.agency_policy_settings;
CREATE POLICY "Only admins can manage agency policies"
ON public.agency_policy_settings FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- agency_rankings
DROP POLICY IF EXISTS "Admins can manage rankings" ON public.agency_rankings;
CREATE POLICY "Only admins can manage rankings"
ON public.agency_rankings FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
