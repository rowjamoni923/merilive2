-- Create sounds storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('sounds', 'sounds', true)
ON CONFLICT (id) DO NOTHING;

-- Drop and recreate policies for sounds bucket
DROP POLICY IF EXISTS "Public sounds are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload sounds" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete sounds" ON storage.objects;

-- Allow public read access for sounds
CREATE POLICY "Public sounds are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'sounds');

-- Allow authenticated users to upload sounds
CREATE POLICY "Authenticated users can upload sounds"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sounds' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete sounds
CREATE POLICY "Authenticated users can delete sounds"
ON storage.objects FOR DELETE
USING (bucket_id = 'sounds' AND auth.role() = 'authenticated');