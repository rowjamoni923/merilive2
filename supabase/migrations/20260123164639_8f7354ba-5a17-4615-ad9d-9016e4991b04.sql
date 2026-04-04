-- Create animations bucket for entry bars and other animations
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'animations', 
  'animations', 
  true,
  104857600, -- 100MB limit
  ARRAY['image/gif', 'image/webp', 'image/png', 'image/jpeg', 'video/mp4', 'video/webm', 'application/json', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 104857600;

-- Create RLS policies for animations bucket
CREATE POLICY "Allow public read access on animations"
ON storage.objects FOR SELECT
USING (bucket_id = 'animations');

CREATE POLICY "Allow authenticated users to upload animations"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'animations' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update animations"
ON storage.objects FOR UPDATE
USING (bucket_id = 'animations' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete animations"
ON storage.objects FOR DELETE
USING (bucket_id = 'animations' AND auth.role() = 'authenticated');