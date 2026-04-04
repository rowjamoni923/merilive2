
-- ============================================================
-- CRITICAL SECURITY HARDENING: Fix all overly permissive policies
-- ============================================================

-- 1. admin_allowed_devices: Only admins should register devices
DROP POLICY IF EXISTS "Authenticated users can register devices" ON public.admin_allowed_devices;
CREATE POLICY "Only admins can register devices"
ON public.admin_allowed_devices FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- 2. chat_moderation_logs: Only admins/system should insert
DROP POLICY IF EXISTS "System can insert moderation logs" ON public.chat_moderation_logs;
CREATE POLICY "Only admins can insert moderation logs"
ON public.chat_moderation_logs FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- 3. gift_transaction_logs: Block direct inserts (use RPCs)
DROP POLICY IF EXISTS "Service can insert gift logs" ON public.gift_transaction_logs;
CREATE POLICY "No direct gift log inserts"
ON public.gift_transaction_logs FOR INSERT
WITH CHECK (false);

-- 4. helper_notifications: Only admins can insert
DROP POLICY IF EXISTS "System manages helper notifications" ON public.helper_notifications;
CREATE POLICY "Only admins can insert helper notifications"
ON public.helper_notifications FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- 5. notifications: Block direct inserts (use RPCs/triggers)
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "No direct notification inserts"
ON public.notifications FOR INSERT
WITH CHECK (false);

-- 6. private_call_security_logs: Only system/admin
DROP POLICY IF EXISTS "System can insert security logs" ON public.private_call_security_logs;
CREATE POLICY "No direct security log inserts"
ON public.private_call_security_logs FOR INSERT
WITH CHECK (false);

-- 7. roulette_sessions: CRITICAL - users should NOT freely create/update
DROP POLICY IF EXISTS "Authenticated users can create roulette sessions" ON public.roulette_sessions;
CREATE POLICY "No direct roulette session creation"
ON public.roulette_sessions FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "Authenticated users can update roulette sessions" ON public.roulette_sessions;
CREATE POLICY "No direct roulette session updates"
ON public.roulette_sessions FOR UPDATE
USING (false);

-- 8. stream_recordings: Only admin/system
DROP POLICY IF EXISTS "Service can insert recordings" ON public.stream_recordings;
CREATE POLICY "No direct recording inserts"
ON public.stream_recordings FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "Service can update recordings" ON public.stream_recordings;
CREATE POLICY "No direct recording updates"
ON public.stream_recordings FOR UPDATE
USING (false);

-- 9. subscription_orders: Only admins (no user_id column - admin managed)
DROP POLICY IF EXISTS "Anyone can create orders" ON public.subscription_orders;
CREATE POLICY "Only admins can create orders"
ON public.subscription_orders FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- 10. system_error_logs: Block public logging (abuse vector)
DROP POLICY IF EXISTS "Anyone can log errors" ON public.system_error_logs;
CREATE POLICY "No direct error log inserts"
ON public.system_error_logs FOR INSERT
WITH CHECK (false);

-- 11. topup_payment_methods: Only admins (these are admin-managed payment methods)
DROP POLICY IF EXISTS "Authenticated users can delete payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can delete payment methods"
ON public.topup_payment_methods FOR DELETE
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can insert payment methods"
ON public.topup_payment_methods FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can update payment methods" ON public.topup_payment_methods;
CREATE POLICY "Only admins can update payment methods"
ON public.topup_payment_methods FOR UPDATE
USING (public.is_admin(auth.uid()));

-- 12. Block admin_logs direct access
DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
CREATE POLICY "No direct admin_logs inserts"
ON public.admin_logs FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
CREATE POLICY "No direct admin_logs updates"
ON public.admin_logs FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
CREATE POLICY "No direct admin_logs deletes"
ON public.admin_logs FOR DELETE
USING (false);

-- 13. Protect agencies table
DROP POLICY IF EXISTS "No direct agency inserts" ON public.agencies;
CREATE POLICY "No direct agency inserts"
ON public.agencies FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct agency updates" ON public.agencies;
CREATE POLICY "No direct agency updates"
ON public.agencies FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct agency deletes" ON public.agencies;
CREATE POLICY "No direct agency deletes"
ON public.agencies FOR DELETE
USING (false);

-- 14. Protect profiles from DELETE
DROP POLICY IF EXISTS "No direct profile deletes" ON public.profiles;
CREATE POLICY "No direct profile deletes"
ON public.profiles FOR DELETE
USING (false);

-- 15. Block live_game_rounds direct access
DROP POLICY IF EXISTS "No direct game round inserts" ON public.live_game_rounds;
CREATE POLICY "No direct game round inserts"
ON public.live_game_rounds FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct game round updates" ON public.live_game_rounds;
CREATE POLICY "No direct game round updates"
ON public.live_game_rounds FOR UPDATE
USING (false);

-- 16. Block live_game_bets direct access
DROP POLICY IF EXISTS "No direct bet inserts" ON public.live_game_bets;
CREATE POLICY "No direct bet inserts"
ON public.live_game_bets FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct bet updates" ON public.live_game_bets;
CREATE POLICY "No direct bet updates"
ON public.live_game_bets FOR UPDATE
USING (false);

-- 17. Protect agency_hosts from direct manipulation
DROP POLICY IF EXISTS "No direct agency_hosts inserts" ON public.agency_hosts;
CREATE POLICY "No direct agency_hosts inserts"
ON public.agency_hosts FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct agency_hosts updates" ON public.agency_hosts;
CREATE POLICY "No direct agency_hosts updates"
ON public.agency_hosts FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct agency_hosts deletes" ON public.agency_hosts;
CREATE POLICY "No direct agency_hosts deletes"
ON public.agency_hosts FOR DELETE
USING (false);

-- 18. Protect coin_packages from user manipulation
DROP POLICY IF EXISTS "No direct coin_package changes" ON public.coin_packages;
CREATE POLICY "No direct coin_package inserts"
ON public.coin_packages FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct coin_package updates"
ON public.coin_packages FOR UPDATE
USING (false);

CREATE POLICY "No direct coin_package deletes"
ON public.coin_packages FOR DELETE
USING (false);

-- 19. Protect admin_section_permissions
DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
CREATE POLICY "No direct perm inserts"
ON public.admin_section_permissions FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
CREATE POLICY "No direct perm updates"
ON public.admin_section_permissions FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
CREATE POLICY "No direct perm deletes"
ON public.admin_section_permissions FOR DELETE
USING (false);
