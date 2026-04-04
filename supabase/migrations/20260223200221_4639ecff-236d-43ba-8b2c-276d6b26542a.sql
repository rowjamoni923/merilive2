
-- ============================================================
-- SECURITY FIX: Remove anonymous access & fix always-true policies
-- ============================================================

-- STEP 1: Revoke ALL privileges from 'anon' role on ALL public tables
-- This prevents unauthenticated users from directly accessing any table
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- STEP 2: Grant back SELECT on genuinely public tables
-- These tables are needed BEFORE user authentication (login page, app config, etc.)
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.app_version_settings TO anon;
GRANT SELECT ON public.branding_settings TO anon;
GRANT SELECT ON public.site_settings TO anon;

-- STEP 3: Fix "RLS Policy Always True" — dangerous public-facing policies

-- 3a. account_lockouts: "System can manage lockouts" should be service_role only
DROP POLICY IF EXISTS "System can manage lockouts" ON public.account_lockouts;
CREATE POLICY "System can manage lockouts"
  ON public.account_lockouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3b. login_attempts: "Anyone can log attempts" should be authenticated only
DROP POLICY IF EXISTS "Anyone can log attempts" ON public.login_attempts;
CREATE POLICY "Authenticated users can log attempts"
  ON public.login_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3c. system_error_logs: "Anyone can log errors" should be authenticated only
DROP POLICY IF EXISTS "Anyone can log errors" ON public.system_error_logs;
CREATE POLICY "Authenticated users can log errors"
  ON public.system_error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- STEP 4: Also revoke anon from cron schema tables (if accessible)
-- cron.job and cron.job_run_details should not be accessible to anon
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM anon';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not revoke cron schema access: %', SQLERRM;
END;
$$;
