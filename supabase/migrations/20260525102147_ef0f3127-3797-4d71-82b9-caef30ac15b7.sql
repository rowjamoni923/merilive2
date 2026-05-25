-- Pkg330 home page audit pass-2b
-- Server-side section-permission gates for home/rating banner management.

DROP POLICY IF EXISTS "Admin session full access" ON public.banners;
DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;

CREATE POLICY "content_hub_admins_manage_banners_pkg330"
ON public.banners
FOR ALL
TO authenticated
USING (public.admin_has_section_permission('content-hub', true))
WITH CHECK (public.admin_has_section_permission('content-hub', true));

CREATE POLICY "content_hub_admin_sessions_manage_banners_pkg330"
ON public.banners
FOR ALL
TO anon
USING (public.admin_has_section_permission('content-hub', true))
WITH CHECK (public.admin_has_section_permission('content-hub', true));

DROP POLICY IF EXISTS "Admin session full access" ON public.rating_banners;

CREATE POLICY "content_hub_admins_manage_rating_banners_pkg330"
ON public.rating_banners
FOR ALL
TO authenticated
USING (public.admin_has_section_permission('content-hub', true))
WITH CHECK (public.admin_has_section_permission('content-hub', true));

CREATE POLICY "content_hub_admin_sessions_manage_rating_banners_pkg330"
ON public.rating_banners
FOR ALL
TO anon
USING (public.admin_has_section_permission('content-hub', true))
WITH CHECK (public.admin_has_section_permission('content-hub', true));