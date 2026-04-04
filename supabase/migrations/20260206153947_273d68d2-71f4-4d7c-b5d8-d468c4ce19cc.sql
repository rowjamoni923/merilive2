-- Create the 'assets' storage bucket for admin uploads (icons, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view assets (public bucket)
CREATE POLICY "Assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'assets');

-- Allow authenticated users (admins) to upload assets
CREATE POLICY "Authenticated users can upload assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their assets
CREATE POLICY "Authenticated users can update assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete assets
CREATE POLICY "Authenticated users can delete assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'assets' AND auth.role() = 'authenticated');