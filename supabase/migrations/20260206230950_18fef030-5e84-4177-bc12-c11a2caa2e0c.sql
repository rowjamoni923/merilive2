
-- =============================================
-- FIX 1: Unify is_admin() function
-- The no-param version should check BOTH user_roles AND admin_users
-- =============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() AND is_active = true
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- =============================================
-- FIX 2: Fix dangerous "Allow all" RLS policies
-- These allow ANYONE (even anon) to INSERT/UPDATE/DELETE
-- =============================================

-- Fix categories table
DROP POLICY IF EXISTS "Allow all for categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix entertainment table
DROP POLICY IF EXISTS "Allow all for entertainment" ON public.entertainment;
CREATE POLICY "Admins can manage entertainment" ON public.entertainment
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix helper_applications table
DROP POLICY IF EXISTS "Allow all for helper_applications" ON public.helper_applications;
CREATE POLICY "Users can submit helper applications" ON public.helper_applications
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage helper applications" ON public.helper_applications
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
CREATE POLICY "Users can view own helper applications" ON public.helper_applications
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix iptv_sources table  
DROP POLICY IF EXISTS "Allow all for iptv_sources" ON public.iptv_sources;
CREATE POLICY "Admins can manage iptv sources" ON public.iptv_sources
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix kids_content table
DROP POLICY IF EXISTS "Allow all for kids_content" ON public.kids_content;
CREATE POLICY "Admins can manage kids content" ON public.kids_content
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix movies table
DROP POLICY IF EXISTS "Allow all for movies" ON public.movies;
CREATE POLICY "Admins can manage movies" ON public.movies
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix music table
DROP POLICY IF EXISTS "Allow all for music" ON public.music;
CREATE POLICY "Admins can manage music" ON public.music
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix news table
DROP POLICY IF EXISTS "Allow all for news" ON public.news;
CREATE POLICY "Admins can manage news" ON public.news
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix news_sources table
DROP POLICY IF EXISTS "Authenticated users can manage news sources" ON public.news_sources;
CREATE POLICY "Admins can manage news sources" ON public.news_sources
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix notification_templates table
DROP POLICY IF EXISTS "Admins can manage notification templates" ON public.notification_templates;
CREATE POLICY "Admins can manage notification templates" ON public.notification_templates
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix channels table
DROP POLICY IF EXISTS "Service role can manage channels" ON public.channels;
CREATE POLICY "Admins can manage channels" ON public.channels
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix game_providers table
DROP POLICY IF EXISTS "Authenticated users can manage game providers" ON public.game_providers;
CREATE POLICY "Admins can manage game providers" ON public.game_providers
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fix game_provider_logs table
DROP POLICY IF EXISTS "Authenticated users can manage provider logs" ON public.game_provider_logs;
CREATE POLICY "Admins can manage provider logs" ON public.game_provider_logs
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =============================================
-- FIX 3: Fix admin_music_library permissive policies
-- =============================================
DROP POLICY IF EXISTS "Admins delete music" ON public.admin_music_library;
DROP POLICY IF EXISTS "Admins insert music" ON public.admin_music_library;
DROP POLICY IF EXISTS "Admins update music" ON public.admin_music_library;

CREATE POLICY "Admins can manage music library" ON public.admin_music_library
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =============================================
-- FIX 4: Fix app_version_settings permissive policies
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert app version settings" ON public.app_version_settings;
DROP POLICY IF EXISTS "Authenticated users can update app version settings" ON public.app_version_settings;

CREATE POLICY "Admins can manage app version settings" ON public.app_version_settings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =============================================
-- FIX 5: Fix helper_level_config service role policy
-- =============================================
DROP POLICY IF EXISTS "Service role manages level config" ON public.helper_level_config;
CREATE POLICY "Admins can manage level config" ON public.helper_level_config
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =============================================
-- FIX 6: Fix helper_notifications service role policy
-- =============================================
DROP POLICY IF EXISTS "Service role manages notifications" ON public.helper_notifications;
CREATE POLICY "System manages helper notifications" ON public.helper_notifications
FOR INSERT TO authenticated
WITH CHECK (true);

-- =============================================
-- FIX 7: Fix helper_withdrawal_requests service role policy
-- =============================================
DROP POLICY IF EXISTS "Service role manages all withdrawals" ON public.helper_withdrawal_requests;
CREATE POLICY "Admins manage all helper withdrawals" ON public.helper_withdrawal_requests
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =============================================
-- FIX 8: Fix agency_rankings system policy
-- =============================================
DROP POLICY IF EXISTS "System can manage rankings" ON public.agency_rankings;
CREATE POLICY "Admins can manage rankings" ON public.agency_rankings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =============================================
-- FIX 9: Fix admin_allowed_devices anon insert
-- =============================================
DROP POLICY IF EXISTS "Allow device registration" ON public.admin_allowed_devices;
CREATE POLICY "Authenticated users can register devices" ON public.admin_allowed_devices
FOR INSERT TO authenticated
WITH CHECK (true);
