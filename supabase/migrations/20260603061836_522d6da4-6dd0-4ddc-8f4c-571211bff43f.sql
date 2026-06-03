
-- Pkg348 Banners & Branding lockdown
-- Replaces catch-all "Admin session full access" + legacy admin_users role-based
-- policies on banner/branding/theme/live-category tables with section-permission-
-- gated splits (select-for-any-admin / write-for-permitted-only), matching the
-- Pkg340/342/343/344/345/346/347 pattern. Audit/user-state tables become
-- SELECT-only for admins (no admin write — only the user owner or service_role).

-- ============================================================
-- 1. app_event_themes (catalog)
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.app_event_themes;
DROP POLICY IF EXISTS "Admins can manage event themes" ON public.app_event_themes;
DROP POLICY IF EXISTS "Admins can manage themes" ON public.app_event_themes;

CREATE POLICY pkg348_app_event_themes_admin_select
  ON public.app_event_themes FOR SELECT
  USING (is_active_admin_session());

CREATE POLICY pkg348_app_event_themes_admin_write
  ON public.app_event_themes FOR ALL
  USING (admin_has_any_section_permission(ARRAY['event-themes','branding','app-branding','content-hub','banners'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['event-themes','branding','app-branding','content-hub','banners'], true));

-- ============================================================
-- 2. branding_settings (catalog — controls app logo / name / colors)
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.branding_settings;
DROP POLICY IF EXISTS "Admins can insert branding settings" ON public.branding_settings;
DROP POLICY IF EXISTS "Admins full access to branding" ON public.branding_settings;
DROP POLICY IF EXISTS "Only admins can update branding" ON public.branding_settings;

CREATE POLICY pkg348_branding_settings_admin_select
  ON public.branding_settings FOR SELECT
  USING (is_active_admin_session());

CREATE POLICY pkg348_branding_settings_admin_write
  ON public.branding_settings FOR ALL
  USING (admin_has_any_section_permission(ARRAY['branding','app-branding','content-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['branding','app-branding','content-hub'], true));

-- ============================================================
-- 3. entry_banners (catalog — premium entry animations gifted/sold)
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.entry_banners;
DROP POLICY IF EXISTS "Admin users can delete entry banners" ON public.entry_banners;
DROP POLICY IF EXISTS "Admin users can insert entry banners" ON public.entry_banners;
DROP POLICY IF EXISTS "Admin users can update entry banners" ON public.entry_banners;

CREATE POLICY pkg348_entry_banners_admin_select
  ON public.entry_banners FOR SELECT
  USING (is_active_admin_session());

CREATE POLICY pkg348_entry_banners_admin_write
  ON public.entry_banners FOR ALL
  USING (admin_has_any_section_permission(ARRAY['entry-banners','banners','content-hub','shop-items','shop-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['entry-banners','banners','content-hub','shop-items','shop-hub'], true));

-- ============================================================
-- 4. live_categories (catalog — home-feed live category tabs)
-- ============================================================
DROP POLICY IF EXISTS live_categories_admin_all ON public.live_categories;

CREATE POLICY pkg348_live_categories_admin_select
  ON public.live_categories FOR SELECT
  USING (is_active_admin_session());

CREATE POLICY pkg348_live_categories_admin_write
  ON public.live_categories FOR ALL
  USING (admin_has_any_section_permission(ARRAY['live-categories','streams','content-hub','banners'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['live-categories','streams','content-hub','banners'], true));

-- ============================================================
-- 5. popup_event_banners (catalog — modal popups shown on app open)
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.popup_event_banners;

CREATE POLICY pkg348_popup_event_banners_admin_select
  ON public.popup_event_banners FOR SELECT
  USING (is_active_admin_session());

CREATE POLICY pkg348_popup_event_banners_admin_write
  ON public.popup_event_banners FOR ALL
  USING (admin_has_any_section_permission(ARRAY['popup-banners','banners','content-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['popup-banners','banners','content-hub'], true));

-- ============================================================
-- 6. user_campaign_views (per-user analytic — admin SELECT only, no admin write)
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.user_campaign_views;

CREATE POLICY pkg348_user_campaign_views_admin_select
  ON public.user_campaign_views FOR SELECT
  USING (is_active_admin_session());

-- ============================================================
-- 7. user_entry_banners (per-user owned entry banner — admin SELECT only)
-- ============================================================
DROP POLICY IF EXISTS "Admin session full access" ON public.user_entry_banners;

CREATE POLICY pkg348_user_entry_banners_admin_select
  ON public.user_entry_banners FOR SELECT
  USING (is_active_admin_session());

-- ============================================================
-- 8. rating_banners cosmetic dedupe (two identical pkg330 policies present)
-- ============================================================
DROP POLICY IF EXISTS content_hub_admin_sessions_manage_rating_banners_pkg330 ON public.rating_banners;
-- Keep content_hub_admins_manage_rating_banners_pkg330 (identical, gated by content-hub)
