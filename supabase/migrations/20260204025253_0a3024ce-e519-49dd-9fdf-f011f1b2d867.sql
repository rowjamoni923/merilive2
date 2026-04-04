-- Create storage bucket for party backgrounds
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'party-backgrounds', 
  'party-backgrounds', 
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Party backgrounds are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'party-backgrounds');

-- Allow authenticated users (admins) to upload
CREATE POLICY "Admins can upload party backgrounds"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'party-backgrounds' AND auth.role() = 'authenticated');

-- Allow authenticated users (admins) to update
CREATE POLICY "Admins can update party backgrounds"
ON storage.objects FOR UPDATE
USING (bucket_id = 'party-backgrounds' AND auth.role() = 'authenticated');

-- Allow authenticated users (admins) to delete
CREATE POLICY "Admins can delete party backgrounds"
ON storage.objects FOR DELETE
USING (bucket_id = 'party-backgrounds' AND auth.role() = 'authenticated');