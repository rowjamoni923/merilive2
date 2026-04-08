-- Drop the restrictive policy
DROP POLICY IF EXISTS "Authenticated upload to app-assets" ON storage.objects;

-- Allow anyone to upload to app-assets (it's a public assets bucket)
CREATE POLICY "Anyone can upload to app-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-assets');