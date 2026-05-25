
-- ============================================================
-- Pkg341 — User / Host / Agency Management lockdown
-- ============================================================

-- Helper: is the target a (currently-active) owner admin? --------------------
CREATE OR REPLACE FUNCTION public._is_target_user_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id
      AND is_active = true
      AND role::text = 'owner'
  );
$$;

-- ── admin_block_user: require user-management edit + protect owners ----------
CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _block boolean, _reason text DEFAULT NULL::text, _ban_device boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _user_ip TEXT;
  _device_id TEXT;
  _admin_id UUID;
  _eff_role TEXT;
BEGIN
  _admin_id := COALESCE(public.current_admin_id_from_header(), auth.uid());
  IF _admin_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  IF NOT public.admin_has_section_permission('user-management', true) THEN
    RAISE EXCEPTION 'Access denied: user-management permission required';
  END IF;

  -- Never allow any admin (even owner) to block an active owner account
  IF public._is_target_user_owner(_user_id) THEN
    RAISE EXCEPTION 'Cannot block an owner account';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET is_blocked = _block,
         blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
         blocked_at = CASE WHEN _block THEN now() ELSE NULL END
   WHERE id = _user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  IF _block AND _ban_device THEN
    SELECT last_login_ip, device_id INTO _user_ip, _device_id FROM public.profiles WHERE id = _user_id;
    IF _user_ip IS NOT NULL AND _user_ip <> '' THEN
      INSERT INTO public.banned_ips (ip_address, user_id, reason, banned_by)
      VALUES (_user_ip, _user_id, COALESCE(_reason, 'Banned by admin'), _admin_id)
      ON CONFLICT (ip_address) DO UPDATE SET is_active = true, updated_at = now();
    END IF;
    IF _device_id IS NOT NULL THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by)
      VALUES (_device_id, _user_id, COALESCE(_reason, 'Banned by admin'), _admin_id)
      ON CONFLICT (device_id) DO UPDATE SET is_active = true, updated_at = now();
    END IF;
  END IF;

  IF _block THEN
    UPDATE public.live_streams SET is_active = false, ended_at = now()
     WHERE host_id = _user_id AND is_active = true;
  END IF;
END;
$$;

-- ── admin_block_agency: require agency-management edit ----------------------
CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id uuid, _block boolean, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF NOT public.admin_has_section_permission('agency-management', true) THEN
    RETURN jsonb_build_object('success',false,'error','agency-management permission required');
  END IF;
  SELECT owner_id INTO v_owner_id FROM public.agencies WHERE id = _agency_id;
  IF v_owner_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','Agency not found'); END IF;
  IF public._is_target_user_owner(v_owner_id) THEN
    RETURN jsonb_build_object('success',false,'error','Cannot block an owner-owned agency');
  END IF;
  UPDATE public.agencies
     SET is_blocked = _block,
         blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
         updated_at = now()
   WHERE id = _agency_id;
  RETURN jsonb_build_object('success',true);
END $$;

-- ── admin_set_host_status: require host-applications or user-management ----
CREATE OR REPLACE FUNCTION public.admin_set_host_status(_user_id uuid, _make_host boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _has_approved_face boolean;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['host-applications','user-management','all-hosts'], true) THEN
    RAISE EXCEPTION 'Access denied: host-applications/user-management permission required';
  END IF;
  IF public._is_target_user_owner(_user_id) THEN
    RAISE EXCEPTION 'Cannot change host status of an owner account';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _make_host THEN
    SELECT EXISTS (SELECT 1 FROM public.face_verification_submissions
      WHERE user_id = _user_id AND status = 'approved') INTO _has_approved_face;
    IF _has_approved_face THEN
      UPDATE public.profiles
         SET gender = 'female', is_host = true, host_status = 'approved',
             is_face_verified = true, is_verified = true,
             host_level = GREATEST(COALESCE(host_level, 0), 1), updated_at = now()
       WHERE id = _user_id;
    ELSE
      INSERT INTO public.face_verification_submissions
        (user_id, verification_type, status, admin_notes, created_at)
      SELECT _user_id, 'host', 'pending',
        'Created by admin - awaiting face verification upload', now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.face_verification_submissions
        WHERE user_id = _user_id AND status IN ('pending', 'under_review'));
    END IF;
  ELSE
    UPDATE public.profiles
       SET gender = 'male', is_host = false, host_status = NULL,
           is_face_verified = false, is_verified = false,
           host_level = 0, updated_at = now()
     WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;

-- ── admin_delete_user: keep owner-only, but also forbid deleting other owners
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.current_effective_admin_role() <> 'owner'
     OR NOT public.admin_has_section_permission('user-management', true) THEN
    RETURN jsonb_build_object('success',false,'error','Owner user-management permission required');
  END IF;
  IF public._is_target_user_owner(_user_id) THEN
    RETURN jsonb_build_object('success',false,'error','Cannot delete another owner account');
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET is_deleted = true, is_blocked = true,
         blocked_at = now(), blocked_reason = 'Account deleted by admin',
         deletion_requested_at = COALESCE(deletion_requested_at, now()),
         deletion_scheduled_at = COALESCE(deletion_scheduled_at, now() + interval '30 days'),
         updated_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_block_user(uuid,boolean,text,boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_block_agency(uuid,boolean,text)        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_host_status(uuid,boolean)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid)                      FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_block_user(uuid,boolean,text,boolean) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_block_agency(uuid,boolean,text)        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_set_host_status(uuid,boolean)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user(uuid)                      TO authenticated, service_role;

-- ============================================================
-- RLS lockdown: replace the catch-all "Admin session full access"
-- (PERMISSIVE FOR ALL via is_active_admin_session()) on six
-- user/host/agency tables with explicit section-permission gates.
-- ============================================================

-- ---- agencies -------------------------------------------------------------
DROP POLICY IF EXISTS "Admin session full access"        ON public.agencies;
DROP POLICY IF EXISTS "Admins can update agencies"       ON public.agencies;
DROP POLICY IF EXISTS "Admins can update all agencies"   ON public.agencies;
DROP POLICY IF EXISTS "Admins can view all agencies"     ON public.agencies;

CREATE POLICY "p341_agencies_admin_read" ON public.agencies
  FOR SELECT TO authenticated, anon
  USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_agencies_admin_update" ON public.agencies
  FOR UPDATE TO authenticated, anon
  USING (public.admin_has_section_permission('agency-management', true))
  WITH CHECK (public.admin_has_section_permission('agency-management', true));

CREATE POLICY "p341_agencies_admin_insert" ON public.agencies
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    auth.uid() = owner_id
    OR public.admin_has_section_permission('agency-management', true)
  );

-- ---- host_applications ---------------------------------------------------
DROP POLICY IF EXISTS "Admin session full access"                 ON public.host_applications;
DROP POLICY IF EXISTS "Admins full access to host_applications"   ON public.host_applications;

CREATE POLICY "p341_host_apps_admin_read" ON public.host_applications
  FOR SELECT TO authenticated, anon
  USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_host_apps_admin_update" ON public.host_applications
  FOR UPDATE TO authenticated, anon
  USING (public.admin_has_section_permission('host-applications', true))
  WITH CHECK (public.admin_has_section_permission('host-applications', true));

CREATE POLICY "p341_host_apps_admin_delete" ON public.host_applications
  FOR DELETE TO authenticated, anon
  USING (public.admin_has_section_permission('host-applications', true));

-- ---- face_verification_submissions ---------------------------------------
DROP POLICY IF EXISTS "Admin session full access" ON public.face_verification_submissions;

CREATE POLICY "p341_face_subs_admin_read" ON public.face_verification_submissions
  FOR SELECT TO authenticated, anon
  USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_face_subs_admin_update" ON public.face_verification_submissions
  FOR UPDATE TO authenticated, anon
  USING (public.admin_has_any_section_permission(ARRAY['face-verification','host-applications','user-management'], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['face-verification','host-applications','user-management'], true));

CREATE POLICY "p341_face_subs_admin_delete" ON public.face_verification_submissions
  FOR DELETE TO authenticated, anon
  USING (public.admin_has_section_permission('face-verification', true));

-- ---- user_reports --------------------------------------------------------
DROP POLICY IF EXISTS "Admin session full access"     ON public.user_reports;
DROP POLICY IF EXISTS "Admins can update reports"     ON public.user_reports;
DROP POLICY IF EXISTS "Admins can view all reports"   ON public.user_reports;

CREATE POLICY "p341_user_reports_admin_read" ON public.user_reports
  FOR SELECT TO authenticated, anon
  USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_user_reports_admin_update" ON public.user_reports
  FOR UPDATE TO authenticated, anon
  USING (public.admin_has_any_section_permission(ARRAY['user-reports','user-management','support-reports'], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['user-reports','user-management','support-reports'], true));

CREATE POLICY "p341_user_reports_admin_delete" ON public.user_reports
  FOR DELETE TO authenticated, anon
  USING (public.admin_has_section_permission('user-reports', true));

-- ---- banned_ips ----------------------------------------------------------
DROP POLICY IF EXISTS "Admin session full access" ON public.banned_ips;

CREATE POLICY "p341_banned_ips_admin_read" ON public.banned_ips
  FOR SELECT TO authenticated, anon
  USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_banned_ips_admin_write" ON public.banned_ips
  FOR ALL TO authenticated, anon
  USING (public.admin_has_any_section_permission(ARRAY['blocked-ips','user-management'], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['blocked-ips','user-management'], true));

-- ---- banned_devices ------------------------------------------------------
DROP POLICY IF EXISTS "Admin session full access"             ON public.banned_devices;
DROP POLICY IF EXISTS "Admins can view all blocked devices"   ON public.banned_devices;
DROP POLICY IF EXISTS "Admins manage blocked devices"         ON public.banned_devices;
DROP POLICY IF EXISTS "Only admins can manage banned devices" ON public.banned_devices;

CREATE POLICY "p341_banned_devices_admin_read" ON public.banned_devices
  FOR SELECT TO authenticated, anon
  USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_banned_devices_admin_write" ON public.banned_devices
  FOR ALL TO authenticated, anon
  USING (public.admin_has_any_section_permission(ARRAY['banned-devices','user-management'], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['banned-devices','user-management'], true));
