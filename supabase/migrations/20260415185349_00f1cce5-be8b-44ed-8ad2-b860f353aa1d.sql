
-- Fix storage policies for banners-media bucket (used by popup event banners)
CREATE POLICY "Admin upload banners-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners-media' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin update banners-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners-media' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin delete banners-media"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners-media' AND public.is_admin(auth.uid()));

CREATE POLICY "Public read banners-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners-media');

-- Also add banners-media to read policy for banners bucket if needed
CREATE POLICY "Admin upload banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin update banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin delete banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners' AND public.is_admin(auth.uid()));

-- Clean up duplicate popup_event_banners policies
DROP POLICY IF EXISTS "Admins can manage popup banners" ON public.popup_event_banners;
DROP POLICY IF EXISTS "admin_manage_v2" ON public.popup_event_banners;
DROP POLICY IF EXISTS "public_read" ON public.popup_event_banners;
