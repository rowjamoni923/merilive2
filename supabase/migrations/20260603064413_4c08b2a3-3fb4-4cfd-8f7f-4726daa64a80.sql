-- Pkg351 emergency admin-panel access repair
-- Root cause: Pkg350 created admin policies for authenticated only, but the admin panel
-- uses the anon key plus x-admin-token custom admin session. Also the screenshot's
-- owner secret link is the base yearly token, while a current-year owner override
-- made that link return token_rotated.

-- 1) Restore the current yearly owner secret link shown/used by the owner.
DELETE FROM public.admin_token_overrides
WHERE kind = 'owner'
  AND rotated_year = EXTRACT(YEAR FROM now())::int;

-- 2) Make Pkg350 admin-session policies usable by the custom admin client again.
--    Security is still enforced by is_active_admin_session() and
--    admin_has_any_section_permission(...); adding anon only lets the anon-key
--    request reach those checks with x-admin-token.

ALTER POLICY pkg350_app_settings_admin_select ON public.app_settings
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_app_settings_admin_write ON public.app_settings
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['app-settings','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['app-settings','settings-hub']::text[], true));

ALTER POLICY pkg350_app_content_admin_select ON public.app_content
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_app_content_admin_write ON public.app_content
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['page-content','app-settings','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['page-content','app-settings','settings-hub']::text[], true));

ALTER POLICY pkg350_app_version_admin_select ON public.app_version_settings
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_app_version_admin_write ON public.app_version_settings
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['app-version','app-settings','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['app-version','app-settings','settings-hub']::text[], true));

ALTER POLICY pkg350_app_icon_admin_select ON public.app_icon_registry
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_app_icon_admin_write ON public.app_icon_registry
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['app-icons','branding','app-settings','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['app-icons','branding','app-settings','settings-hub']::text[], true));

ALTER POLICY pkg350_site_settings_admin_select ON public.site_settings
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_site_settings_admin_write ON public.site_settings
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['app-settings','branding','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['app-settings','branding','settings-hub']::text[], true));

ALTER POLICY pkg350_agency_policy_admin_select ON public.agency_policy_settings
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_agency_policy_admin_write ON public.agency_policy_settings
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['agency-policy','agency-hub','agency-management','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['agency-policy','agency-hub','agency-management','settings-hub']::text[], true));

ALTER POLICY pkg350_invitation_settings_admin_select ON public.invitation_settings
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_invitation_settings_admin_write ON public.invitation_settings
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks','settings-hub','app-settings']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['leaderboard','daily-tasks','settings-hub','app-settings']::text[], true));

ALTER POLICY pkg350_consumption_return_admin_select ON public.consumption_return_config
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_consumption_return_admin_write ON public.consumption_return_config
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['consumption-return','finance-hub','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['consumption-return','finance-hub','settings-hub']::text[], true));

ALTER POLICY pkg350_feature_levels_admin_select ON public.feature_level_requirements
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_feature_levels_admin_write ON public.feature_level_requirements
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['feature-levels','level-hub','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['feature-levels','level-hub','settings-hub']::text[], true));

ALTER POLICY pkg350_cost_alerts_admin_select ON public.cost_monitor_alerts
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_cost_alerts_admin_write ON public.cost_monitor_alerts
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['admin-management','admin-logs','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['admin-management','admin-logs','settings-hub']::text[], true));
ALTER POLICY pkg350_cost_samples_admin_select ON public.cost_monitor_samples
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_cost_snapshots_admin_select ON public.cost_monitor_snapshots
  TO anon, authenticated
  USING (public.is_active_admin_session());

ALTER POLICY pkg350_failed_login_admin_select ON public.failed_login_attempts
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_login_attempts_admin_select ON public.login_attempts
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_security_alerts_admin_select ON public.security_alerts
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_security_alerts_admin_resolve ON public.security_alerts
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['admin-management','admin-logs','moderation-hub','settings-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['admin-management','admin-logs','moderation-hub','settings-hub']::text[], true));
ALTER POLICY pkg350_security_audit_admin_select ON public.security_audit_log
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_session_sec_admin_select ON public.session_security_logs
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_vpn_admin_select ON public.vpn_detection_logs
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_payment_recon_admin_select ON public.payment_reconciliation_log
  TO anon, authenticated
  USING (public.is_active_admin_session());
ALTER POLICY pkg350_sys_err_admin_select ON public.system_error_logs
  TO anon, authenticated
  USING (public.is_active_admin_session());