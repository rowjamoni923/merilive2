
-- Make face-verification bucket public so viewers can load profile photos, cover, posters
UPDATE storage.buckets SET public = true WHERE id = 'face-verification';

-- Add explicit public-read policy (idempotent)
DROP POLICY IF EXISTS "public_read_face_verification" ON storage.objects;
CREATE POLICY "public_read_face_verification"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-verification');
