-- Pkg341 pass-2: remove remaining broad direct table mutation surfaces (safe retry)

DROP POLICY IF EXISTS "Admin session full access" ON public.profiles;
DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "p341_profiles_admin_read" ON public.profiles;
DROP POLICY IF EXISTS "p341_profiles_admin_update" ON public.profiles;
DROP POLICY IF EXISTS "p341_profiles_admin_insert" ON public.profiles;

CREATE POLICY "p341_profiles_admin_read"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (public.current_admin_id_from_header() IS NOT NULL);

CREATE POLICY "p341_profiles_admin_update"
ON public.profiles
FOR UPDATE
TO anon, authenticated
USING (
  public.admin_has_any_section_permission(
    ARRAY['user-management','host-applications','face-verification','all-hosts','agency-management'],
    true
  )
)
WITH CHECK (
  public.admin_has_any_section_permission(
    ARRAY['user-management','host-applications','face-verification','all-hosts','agency-management'],
    true
  )
);

CREATE POLICY "p341_profiles_admin_insert"
ON public.profiles
FOR INSERT
TO anon, authenticated
WITH CHECK (public.current_effective_admin_role() = 'owner');

DROP POLICY IF EXISTS "p341_host_apps_admin_update" ON public.host_applications;
DROP POLICY IF EXISTS "p341_host_apps_admin_delete" ON public.host_applications;
DROP POLICY IF EXISTS "p341_host_apps_owner_admin_update" ON public.host_applications;
DROP POLICY IF EXISTS "p341_host_apps_owner_admin_delete" ON public.host_applications;

CREATE POLICY "p341_host_apps_owner_admin_update"
ON public.host_applications
FOR UPDATE
TO anon, authenticated
USING (
  public.current_effective_admin_role() = 'owner'
  AND public.admin_has_any_section_permission(ARRAY['host-applications','user-management'], true)
)
WITH CHECK (
  public.current_effective_admin_role() = 'owner'
  AND public.admin_has_any_section_permission(ARRAY['host-applications','user-management'], true)
);

CREATE POLICY "p341_host_apps_owner_admin_delete"
ON public.host_applications
FOR DELETE
TO anon, authenticated
USING (
  public.current_effective_admin_role() = 'owner'
  AND public.admin_has_any_section_permission(ARRAY['host-applications','user-management'], true)
);

DROP POLICY IF EXISTS "p341_face_subs_admin_update" ON public.face_verification_submissions;
DROP POLICY IF EXISTS "p341_face_subs_admin_delete" ON public.face_verification_submissions;
DROP POLICY IF EXISTS "p341_face_subs_owner_admin_update" ON public.face_verification_submissions;
DROP POLICY IF EXISTS "p341_face_subs_owner_admin_delete" ON public.face_verification_submissions;

CREATE POLICY "p341_face_subs_owner_admin_update"
ON public.face_verification_submissions
FOR UPDATE
TO anon, authenticated
USING (
  public.current_effective_admin_role() = 'owner'
  AND public.admin_has_any_section_permission(ARRAY['face-verification','host-applications','user-management'], true)
)
WITH CHECK (
  public.current_effective_admin_role() = 'owner'
  AND public.admin_has_any_section_permission(ARRAY['face-verification','host-applications','user-management'], true)
);

CREATE POLICY "p341_face_subs_owner_admin_delete"
ON public.face_verification_submissions
FOR DELETE
TO anon, authenticated
USING (
  public.current_effective_admin_role() = 'owner'
  AND public.admin_has_section_permission('face-verification', true)
);

DROP POLICY IF EXISTS "p341_user_reports_admin_write" ON public.user_reports;
DROP POLICY IF EXISTS "p341_user_reports_admin_update" ON public.user_reports;
DROP POLICY IF EXISTS "p341_user_reports_admin_delete" ON public.user_reports;

CREATE POLICY "p341_user_reports_admin_update"
ON public.user_reports
FOR UPDATE
TO anon, authenticated
USING (public.admin_has_any_section_permission(ARRAY['user-reports','user-management','support-reports'], true))
WITH CHECK (public.admin_has_any_section_permission(ARRAY['user-reports','user-management','support-reports'], true));

CREATE POLICY "p341_user_reports_admin_delete"
ON public.user_reports
FOR DELETE
TO anon, authenticated
USING (public.current_effective_admin_role() = 'owner');