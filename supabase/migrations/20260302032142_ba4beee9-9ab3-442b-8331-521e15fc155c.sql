
-- Create app-assets storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('app-assets', 'app-assets', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload app-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-assets' AND auth.role() = 'authenticated');

-- Allow public read access
CREATE POLICY "Public read access for app-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-assets');

-- Allow authenticated users to update
CREATE POLICY "Authenticated users can update app-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'app-assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete app-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'app-assets' AND auth.role() = 'authenticated');
