
-- Fix remaining 20 policies that still use {public} role → change to {authenticated}

-- 1. account_lockouts
DROP POLICY IF EXISTS "Anyone can check lockout status" ON public.account_lockouts;
CREATE POLICY "Authenticated can check lockout status"
  ON public.account_lockouts FOR SELECT TO authenticated
  USING (true);

-- 2. allowed_external_links
DROP POLICY IF EXISTS "Anyone can read allowed links" ON public.allowed_external_links;
CREATE POLICY "Authenticated can read allowed links"
  ON public.allowed_external_links FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only admins can delete allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can delete allowed links"
  ON public.allowed_external_links FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

DROP POLICY IF EXISTS "Only admins can insert allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can insert allowed links"
  ON public.allowed_external_links FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

DROP POLICY IF EXISTS "Only admins can update allowed links" ON public.allowed_external_links;
CREATE POLICY "Only admins can update allowed links"
  ON public.allowed_external_links FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- 3. branding_settings - needs anon SELECT for login page, so keep public but explicitly
-- Actually this was already granted SELECT to anon. Let's change policy to authenticated
-- but the GRANT we did earlier handles anon access at table level
DROP POLICY IF EXISTS "Anyone can read branding settings" ON public.branding_settings;
CREATE POLICY "Anyone can read branding settings"
  ON public.branding_settings FOR SELECT TO authenticated, anon
  USING (true);

-- 4. conversation_encryption_keys
DROP POLICY IF EXISTS "Users can insert own encryption keys" ON public.conversation_encryption_keys;
CREATE POLICY "Users can insert own encryption keys"
  ON public.conversation_encryption_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own encryption keys" ON public.conversation_encryption_keys;
CREATE POLICY "Users can update own encryption keys"
  ON public.conversation_encryption_keys FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own encryption keys" ON public.conversation_encryption_keys;
CREATE POLICY "Users can view own encryption keys"
  ON public.conversation_encryption_keys FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5. login_attempts
DROP POLICY IF EXISTS "Admins can view login attempts" ON public.login_attempts;
CREATE POLICY "Admins can view login attempts"
  ON public.login_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

-- 6. profiles
DROP POLICY IF EXISTS "Authenticated users can view basic profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view basic profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (is_real_user() AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view other profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view other profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (is_real_user() AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;
CREATE POLICY "Users can view own full profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (is_real_user() AND auth.uid() = id);

-- 7. security_alerts
DROP POLICY IF EXISTS "Admins can resolve security alerts" ON public.security_alerts;
CREATE POLICY "Admins can resolve security alerts"
  ON public.security_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

DROP POLICY IF EXISTS "Admins can view security alerts" ON public.security_alerts;
CREATE POLICY "Admins can view security alerts"
  ON public.security_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

DROP POLICY IF EXISTS "Authenticated users can create alerts" ON public.security_alerts;
CREATE POLICY "Authenticated users can create alerts"
  ON public.security_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 8. session_security_logs
DROP POLICY IF EXISTS "Users can insert own session logs" ON public.session_security_logs;
CREATE POLICY "Users can insert own session logs"
  ON public.session_security_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own session logs" ON public.session_security_logs;
CREATE POLICY "Users can view own session logs"
  ON public.session_security_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 9. vpn_detection_logs
DROP POLICY IF EXISTS "Admins can view vpn logs" ON public.vpn_detection_logs;
CREATE POLICY "Admins can view vpn logs"
  ON public.vpn_detection_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true));

DROP POLICY IF EXISTS "Service role can manage vpn logs" ON public.vpn_detection_logs;
CREATE POLICY "Service role can manage vpn logs"
  ON public.vpn_detection_logs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
