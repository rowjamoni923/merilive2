-- Create 'frames' bucket for avatar frame files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'frames', 
  'frames', 
  true, 
  104857600,  -- 100MB limit
  ARRAY['image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'application/json', 'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

-- Public read access for anyone
CREATE POLICY "frames_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'frames');

-- Authenticated users can upload
CREATE POLICY "frames_auth_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'frames');

-- Authenticated users can update
CREATE POLICY "frames_auth_update" ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'frames');

-- Authenticated users can delete
CREATE POLICY "frames_auth_delete" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'frames');