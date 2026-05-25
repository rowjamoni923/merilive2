-- helper: owner session derived from x-admin-token
CREATE OR REPLACE FUNCTION public.is_active_admin_owner_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_is_owner boolean := false;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT (role = 'owner'::admin_role) INTO v_is_owner
  FROM public.admin_users
  WHERE id = v_admin_id AND is_active = true;
  RETURN COALESCE(v_is_owner, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_admin_owner_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin_owner_session() TO authenticated, service_role;
COMMENT ON FUNCTION public.is_active_admin_owner_session() IS
'Pkg340: true only if x-admin-token belongs to an active OWNER admin on an approved device.';

-- 1. admin_users
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_users;
DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can update own profile" ON public.admin_users;
CREATE POLICY "admin_users_read_active_admin" ON public.admin_users FOR SELECT
  USING (public.is_active_admin_session() OR public.is_admin(auth.uid()));
CREATE POLICY "admin_users_owner_only_insert" ON public.admin_users FOR INSERT
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_users_owner_only_update" ON public.admin_users FOR UPDATE
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_users_owner_only_delete" ON public.admin_users FOR DELETE
  USING (public.is_active_admin_owner_session());

-- 2. admin_section_permissions
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_section_permissions;
DROP POLICY IF EXISTS "No direct perm inserts" ON public.admin_section_permissions;
DROP POLICY IF EXISTS "No direct perm updates" ON public.admin_section_permissions;
DROP POLICY IF EXISTS "No direct perm deletes" ON public.admin_section_permissions;
CREATE POLICY "admin_perms_read_active_admin" ON public.admin_section_permissions FOR SELECT
  USING (public.is_active_admin_session() OR public.is_admin(auth.uid()));
CREATE POLICY "admin_perms_owner_only_insert" ON public.admin_section_permissions FOR INSERT
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_perms_owner_only_update" ON public.admin_section_permissions FOR UPDATE
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_perms_owner_only_delete" ON public.admin_section_permissions FOR DELETE
  USING (public.is_active_admin_owner_session());

-- 3. admin_sections
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_sections;
CREATE POLICY "admin_sections_owner_only_insert" ON public.admin_sections FOR INSERT
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_sections_owner_only_update" ON public.admin_sections FOR UPDATE
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_sections_owner_only_delete" ON public.admin_sections FOR DELETE
  USING (public.is_active_admin_owner_session());
CREATE POLICY "admin_sections_read_active_admin" ON public.admin_sections FOR SELECT
  USING (public.is_active_admin_session() OR is_active = true);

-- 4. admin_allowed_devices
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "no_direct_admin_device_inserts" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "no_direct_admin_device_updates" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "no_direct_admin_device_deletes" ON public.admin_allowed_devices;
CREATE POLICY "admin_devices_owner_only_insert" ON public.admin_allowed_devices FOR INSERT
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_devices_owner_only_update" ON public.admin_allowed_devices FOR UPDATE
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_devices_owner_only_delete" ON public.admin_allowed_devices FOR DELETE
  USING (public.is_active_admin_owner_session());

-- 5. admin_access_tokens
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_access_tokens;
CREATE POLICY "admin_access_tokens_owner_only_insert" ON public.admin_access_tokens FOR INSERT
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_access_tokens_owner_only_update" ON public.admin_access_tokens FOR UPDATE
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());
CREATE POLICY "admin_access_tokens_owner_only_delete" ON public.admin_access_tokens FOR DELETE
  USING (public.is_active_admin_owner_session());
CREATE POLICY "admin_access_tokens_read_owner" ON public.admin_access_tokens FOR SELECT
  USING (public.is_active_admin_owner_session());

-- 6. admin_invitations
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_invitations;
CREATE POLICY "admin_invitations_owner_only_all" ON public.admin_invitations FOR ALL
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());

-- 7. admin_token_overrides
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_token_overrides;
CREATE POLICY "admin_token_overrides_owner_only_all" ON public.admin_token_overrides FOR ALL
  USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());

-- 8. admin_owner_whitelist
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_owner_whitelist;

-- 9. admin_security_pin / admin_pin_otp / admin_pin_trusted_devices
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_security_pin;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_pin_otp;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_pin_trusted_devices;
CREATE POLICY "admin_security_pin_owner_or_service" ON public.admin_security_pin FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role' OR public.is_active_admin_owner_session())
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role' OR public.is_active_admin_owner_session());
CREATE POLICY "admin_pin_otp_service_only" ON public.admin_pin_otp FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "admin_pin_trusted_devices_owner_or_service" ON public.admin_pin_trusted_devices FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role' OR public.is_active_admin_owner_session())
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role' OR public.is_active_admin_owner_session());

-- 10. admin_login_otps
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_login_otps;
DROP POLICY IF EXISTS "No public access to admin_login_otps" ON public.admin_login_otps;
CREATE POLICY "admin_login_otps_service_only" ON public.admin_login_otps FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 11. admin_logs — audit trail integrity
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_logs;
DROP POLICY IF EXISTS "No direct admin_logs deletes" ON public.admin_logs;
DROP POLICY IF EXISTS "No direct admin_logs updates" ON public.admin_logs;
DROP POLICY IF EXISTS "No direct admin_logs inserts" ON public.admin_logs;
CREATE POLICY "admin_logs_service_only_update" ON public.admin_logs FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "admin_logs_service_only_delete" ON public.admin_logs FOR DELETE
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- 12. admin_pending_actions
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_pending_actions;
CREATE POLICY "admin_pending_actions_owner_or_service" ON public.admin_pending_actions FOR ALL
  USING (public.is_active_admin_owner_session() OR (auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK (public.is_active_admin_owner_session() OR (auth.jwt() ->> 'role') = 'service_role');

-- 13. admin_permanent_ban_cases / targets — drop catch-all (granular policies stay)
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_permanent_ban_cases;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_permanent_ban_case_targets;

-- 14. admin_stats — read via existing policy; writes via service_role
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_stats;
CREATE POLICY "admin_stats_service_only_write" ON public.admin_stats FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 15. admin_sessions — sub-admin can only see/end their own
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_sessions;
CREATE POLICY "admin_sessions_owner_or_self_select" ON public.admin_sessions FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_active_admin_owner_session()
    OR admin_user_id = public.current_admin_id_from_header()
  );
CREATE POLICY "admin_sessions_owner_or_self_delete" ON public.admin_sessions FOR DELETE
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_active_admin_owner_session()
    OR admin_user_id = public.current_admin_id_from_header()
  );
CREATE POLICY "admin_sessions_service_only_insert" ON public.admin_sessions FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "admin_sessions_service_only_update" ON public.admin_sessions FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');