
-- Pkg350 Analytics/Settings final lockdown
-- Drop catch-all + legacy role policies; replace with section-perm gated pattern
-- Audit/security tables become SELECT-only

-- ============================================================
-- CATALOG/CONFIG TABLES (public read kept; admin write gated)
-- ============================================================

-- app_settings (CRITICAL: controls call rates, beans/USD, bonuses)
DROP POLICY IF EXISTS "Admin session full access" ON public.app_settings;
DROP POLICY IF EXISTS "Only admins can manage settings" ON public.app_settings;
CREATE POLICY pkg350_app_settings_admin_select ON public.app_settings
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_app_settings_admin_write ON public.app_settings
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['app-settings','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['app-settings','settings-hub']::text[], true));

-- app_content
DROP POLICY IF EXISTS "Admin session full access" ON public.app_content;
DROP POLICY IF EXISTS "Admins can manage app content" ON public.app_content;
DROP POLICY IF EXISTS "Only admins can manage content" ON public.app_content;
CREATE POLICY pkg350_app_content_admin_select ON public.app_content
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_app_content_admin_write ON public.app_content
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['page-content','app-settings','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['page-content','app-settings','settings-hub']::text[], true));

-- app_version_settings
DROP POLICY IF EXISTS "Admin session full access" ON public.app_version_settings;
DROP POLICY IF EXISTS "Admins can manage version settings" ON public.app_version_settings;
DROP POLICY IF EXISTS "Only admins can manage version settings" ON public.app_version_settings;
CREATE POLICY pkg350_app_version_admin_select ON public.app_version_settings
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_app_version_admin_write ON public.app_version_settings
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['app-version','app-settings','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['app-version','app-settings','settings-hub']::text[], true));

-- app_icon_registry
DROP POLICY IF EXISTS "Admin session full access" ON public.app_icon_registry;
DROP POLICY IF EXISTS "Admins can manage icon registry" ON public.app_icon_registry;
CREATE POLICY pkg350_app_icon_admin_select ON public.app_icon_registry
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_app_icon_admin_write ON public.app_icon_registry
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['app-icons','branding','app-settings','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['app-icons','branding','app-settings','settings-hub']::text[], true));

-- site_settings
DROP POLICY IF EXISTS "Admin session full access" ON public.site_settings;
CREATE POLICY pkg350_site_settings_admin_select ON public.site_settings
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_site_settings_admin_write ON public.site_settings
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['app-settings','branding','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['app-settings','branding','settings-hub']::text[], true));

-- agency_policy_settings
DROP POLICY IF EXISTS "Admin session full access" ON public.agency_policy_settings;
DROP POLICY IF EXISTS "Admins can manage policy settings" ON public.agency_policy_settings;
DROP POLICY IF EXISTS "Only admins can manage agency policies" ON public.agency_policy_settings;
CREATE POLICY pkg350_agency_policy_admin_select ON public.agency_policy_settings
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_agency_policy_admin_write ON public.agency_policy_settings
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['agency-policy','agency-hub','agency-management','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['agency-policy','agency-hub','agency-management','settings-hub']::text[], true));

-- invitation_settings
DROP POLICY IF EXISTS "Admin session full access" ON public.invitation_settings;
CREATE POLICY pkg350_invitation_settings_admin_select ON public.invitation_settings
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_invitation_settings_admin_write ON public.invitation_settings
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks','settings-hub','app-settings']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks','settings-hub','app-settings']::text[], true));

-- consumption_return_config
DROP POLICY IF EXISTS "Admin session full access" ON public.consumption_return_config;
DROP POLICY IF EXISTS "Admins can manage cashback tiers" ON public.consumption_return_config;
DROP POLICY IF EXISTS "Admins can manage consumption config" ON public.consumption_return_config;
CREATE POLICY pkg350_consumption_return_admin_select ON public.consumption_return_config
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_consumption_return_admin_write ON public.consumption_return_config
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['consumption-return','finance-hub','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['consumption-return','finance-hub','settings-hub']::text[], true));

-- feature_level_requirements
DROP POLICY IF EXISTS "Admin session full access" ON public.feature_level_requirements;
DROP POLICY IF EXISTS "Admins can manage feature requirements" ON public.feature_level_requirements;
CREATE POLICY pkg350_feature_levels_admin_select ON public.feature_level_requirements
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_feature_levels_admin_write ON public.feature_level_requirements
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['feature-levels','level-hub','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['feature-levels','level-hub','settings-hub']::text[], true));

-- ============================================================
-- COST MONITOR — gated writes via admin-management/settings-hub
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.cost_monitor_alerts;
DROP POLICY IF EXISTS "Admin session full access" ON public.cost_monitor_samples;
DROP POLICY IF EXISTS "Admin session full access" ON public.cost_monitor_snapshots;

CREATE POLICY pkg350_cost_alerts_admin_select ON public.cost_monitor_alerts
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_cost_alerts_admin_write ON public.cost_monitor_alerts
  FOR ALL TO authenticated
  USING (admin_has_any_section_permission(ARRAY['admin-management','admin-logs','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['admin-management','admin-logs','settings-hub']::text[], true));

CREATE POLICY pkg350_cost_samples_admin_select ON public.cost_monitor_samples
  FOR SELECT TO authenticated USING (is_active_admin_session());
-- samples written only by cron/edge (service_role); no admin write policy

CREATE POLICY pkg350_cost_snapshots_admin_select ON public.cost_monitor_snapshots
  FOR SELECT TO authenticated USING (is_active_admin_session());
-- snapshots written only by cron/edge (service_role)

-- ============================================================
-- SECURITY / AUDIT LOG TABLES — admin SELECT-only (tamper-proof)
-- Writes ONLY via service_role / triggers / SECDEF / cron
-- ============================================================

-- failed_login_attempts
DROP POLICY IF EXISTS "Admin session full access" ON public.failed_login_attempts;
CREATE POLICY pkg350_failed_login_admin_select ON public.failed_login_attempts
  FOR SELECT TO authenticated USING (is_active_admin_session());

-- login_attempts
DROP POLICY IF EXISTS "Admin session full access" ON public.login_attempts;
CREATE POLICY pkg350_login_attempts_admin_select ON public.login_attempts
  FOR SELECT TO authenticated USING (is_active_admin_session());

-- security_alerts (admin can still resolve via UPDATE)
DROP POLICY IF EXISTS "Admin session full access" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can resolve security alerts" ON public.security_alerts;
CREATE POLICY pkg350_security_alerts_admin_select ON public.security_alerts
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_security_alerts_admin_resolve ON public.security_alerts
  FOR UPDATE TO authenticated
  USING (admin_has_any_section_permission(ARRAY['admin-management','admin-logs','moderation-hub','settings-hub']::text[], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['admin-management','admin-logs','moderation-hub','settings-hub']::text[], true));

-- security_audit_log
DROP POLICY IF EXISTS "Admin session full access" ON public.security_audit_log;
CREATE POLICY pkg350_security_audit_admin_select ON public.security_audit_log
  FOR SELECT TO authenticated USING (is_active_admin_session());

-- session_security_logs
DROP POLICY IF EXISTS "Admin session full access" ON public.session_security_logs;
CREATE POLICY pkg350_session_sec_admin_select ON public.session_security_logs
  FOR SELECT TO authenticated USING (is_active_admin_session());

-- vpn_detection_logs
DROP POLICY IF EXISTS "Admin session full access" ON public.vpn_detection_logs;
CREATE POLICY pkg350_vpn_admin_select ON public.vpn_detection_logs
  FOR SELECT TO authenticated USING (is_active_admin_session());

-- payment_reconciliation_log
DROP POLICY IF EXISTS "Admin session full access" ON public.payment_reconciliation_log;
CREATE POLICY pkg350_payment_recon_admin_select ON public.payment_reconciliation_log
  FOR SELECT TO authenticated USING (is_active_admin_session());

-- system_error_logs: CRITICAL — anon INSERT open ("Anyone can insert error logs") → log flood / disk exhaustion
DROP POLICY IF EXISTS "Admin session full access" ON public.system_error_logs;
DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.system_error_logs;
CREATE POLICY pkg350_sys_err_admin_select ON public.system_error_logs
  FOR SELECT TO authenticated USING (is_active_admin_session());
CREATE POLICY pkg350_sys_err_auth_insert ON public.system_error_logs
  FOR INSERT TO authenticated WITH CHECK (true);
-- anon can no longer insert; authenticated still can (client error reporting)
-- service_role bypass RLS for cron/edge writers
