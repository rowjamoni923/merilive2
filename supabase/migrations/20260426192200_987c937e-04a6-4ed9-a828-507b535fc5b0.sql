-- Allow admin panel (custom session via x-admin-token header) to upload/update/delete in `branding` bucket.
-- Public read access already covered by existing "Public buckets are readable by everyone" policy.

CREATE POLICY "Admin session can upload branding"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'branding' AND public.is_active_admin_session()
);

CREATE POLICY "Admin session can update branding"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'branding' AND public.is_active_admin_session())
WITH CHECK (bucket_id = 'branding' AND public.is_active_admin_session());

CREATE POLICY "Admin session can delete branding"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'branding' AND public.is_active_admin_session());

-- Update branding bucket: ensure 50MB limit and explicitly allow GIF/video MIME types
UPDATE storage.buckets
SET 
  public = true,
  file_size_limit = 52428800, -- 50MB
  allowed_mime_types = ARRAY[
    'image/png','image/jpeg','image/jpg','image/webp','image/gif','image/avif','image/bmp',
    'video/mp4','video/webm','video/quicktime','video/x-m4v'
  ]
WHERE id = 'branding';