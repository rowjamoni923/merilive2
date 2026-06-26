
-- Allow active admin sessions to upload/manage broadcast images under assets/broadcast/*
DROP POLICY IF EXISTS "admin_broadcast_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "admin_broadcast_images_update" ON storage.objects;
DROP POLICY IF EXISTS "admin_broadcast_images_delete" ON storage.objects;
DROP POLICY IF EXISTS "admin_broadcast_images_select" ON storage.objects;

CREATE POLICY "admin_broadcast_images_insert" ON storage.objects
FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'broadcast'
  AND public.is_active_admin_session()
);

CREATE POLICY "admin_broadcast_images_update" ON storage.objects
FOR UPDATE TO anon, authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'broadcast'
  AND public.is_active_admin_session()
)
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'broadcast'
  AND public.is_active_admin_session()
);

CREATE POLICY "admin_broadcast_images_delete" ON storage.objects
FOR DELETE TO anon, authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'broadcast'
  AND public.is_active_admin_session()
);
