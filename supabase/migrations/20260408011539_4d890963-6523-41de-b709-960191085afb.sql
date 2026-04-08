DROP POLICY IF EXISTS "Anyone can upload to app-assets" ON storage.objects;

CREATE POLICY "Authenticated upload to app-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-assets' AND auth.role() = 'authenticated');