
-- Allow authenticated users to upload to level-assets bucket
CREATE POLICY "Authenticated users can upload to level-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'level-assets');

-- Allow public read access to level-assets
CREATE POLICY "Public read access for level-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'level-assets');

-- Allow authenticated users to update files in level-assets
CREATE POLICY "Authenticated users can update level-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'level-assets');

-- Allow authenticated users to delete from level-assets
CREATE POLICY "Authenticated users can delete from level-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'level-assets');
