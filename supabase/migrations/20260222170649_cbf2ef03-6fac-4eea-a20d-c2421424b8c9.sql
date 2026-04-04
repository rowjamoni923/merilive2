-- Create the 'banners' storage bucket for popup event banners
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Banners are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- Allow authenticated admin uploads
CREATE POLICY "Admins can upload banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners' AND auth.role() = 'authenticated');

-- Allow authenticated admin updates
CREATE POLICY "Admins can update banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners' AND auth.role() = 'authenticated');

-- Allow authenticated admin deletes
CREATE POLICY "Admins can delete banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners' AND auth.role() = 'authenticated');