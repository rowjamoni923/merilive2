-- Create frames storage bucket for SVGA/Lottie/GIF files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('frames', 'frames', true, 20971520, ARRAY['image/gif', 'image/webp', 'image/png', 'application/json', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/gif', 'image/webp', 'image/png', 'application/json', 'application/octet-stream'];

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Public read access for frames" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload frames" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete frames" ON storage.objects;

-- Enable public read access for frames bucket
CREATE POLICY "Public read access for frames"
ON storage.objects FOR SELECT
USING (bucket_id = 'frames');

-- Enable authenticated upload for frames bucket
CREATE POLICY "Authenticated users can upload frames"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'frames');

-- Enable authenticated delete for frames bucket
CREATE POLICY "Authenticated users can delete frames"
ON storage.objects FOR DELETE
USING (bucket_id = 'frames');