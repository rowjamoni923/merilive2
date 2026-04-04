-- Make face-verification bucket public so admin can see uploaded photos/videos
UPDATE storage.buckets SET public = true WHERE id = 'face-verification';

-- Add public read policy for face-verification bucket
CREATE POLICY "Public read access for face-verification"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-verification');