
-- ===========================================
-- FIX 1: Add missing admin to user_roles table
-- ===========================================
INSERT INTO public.user_roles (user_id, role)
SELECT au.user_id, 'admin'::app_role
FROM public.admin_users au
WHERE au.is_active = true
  AND au.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = au.user_id AND ur.role = 'admin'
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- ===========================================
-- FIX 2: entry_banners - Add missing INSERT/UPDATE/DELETE admin policies
-- ===========================================
CREATE POLICY "Admin users can insert entry banners"
ON public.entry_banners FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

CREATE POLICY "Admin users can update entry banners"
ON public.entry_banners FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

CREATE POLICY "Admin users can delete entry banners"
ON public.entry_banners FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

-- ===========================================
-- FIX 3: entry_name_bars - Replace user_roles-based policy with admin_users-based
-- ===========================================
DROP POLICY IF EXISTS "Admins can manage entry name bars" ON public.entry_name_bars;

CREATE POLICY "Admins can manage entry name bars"
ON public.entry_name_bars FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

-- ===========================================
-- FIX 4: shop-items storage bucket - Replace user_roles-based policies with admin_users-based
-- ===========================================
DROP POLICY IF EXISTS "Admin can upload shop items" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update shop items" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete shop items" ON storage.objects;

CREATE POLICY "Admin can upload shop items"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'shop-items' AND
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

CREATE POLICY "Admin can update shop items"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'shop-items' AND
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

CREATE POLICY "Admin can delete shop items"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'shop-items' AND
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);
