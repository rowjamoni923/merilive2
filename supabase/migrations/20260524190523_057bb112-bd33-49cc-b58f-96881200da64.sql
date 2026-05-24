-- Pkg314 pass-3: private bucket envelopes + remove global owner read

-- 1) Private verification media must stay private and must not accept wildcard/unknown file types.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'
    ]::text[]
WHERE id IN ('face-verification', 'host-verification');

-- 2) Private proof/screenshot/support buckets need explicit upload envelopes.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
    ]::text[]
WHERE id IN ('payment-proofs', 'payment-screenshots', 'helper-screenshots');

UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'
    ]::text[]
WHERE id = 'support-attachments';

UPDATE storage.buckets
SET public = false,
    file_size_limit = 1073741824,
    allowed_mime_types = ARRAY[
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
      'application/vnd.apple.mpegurl', 'application/x-mpegURL'
    ]::text[]
WHERE id = 'live-recordings';

-- 3) Remove broad storage reads. Bucket-specific rules below replace it.
DROP POLICY IF EXISTS "Owner can read own objects" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for face-verification" ON storage.objects;
DROP POLICY IF EXISTS "Public read face-verification" ON storage.objects;
DROP POLICY IF EXISTS "Public read host-verification" ON storage.objects;
DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public read payment-logo files in payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public can read support attachments" ON storage.objects;

-- 4) Scoped owner reads for private buckets: only auth.uid()/... paths.
DROP POLICY IF EXISTS "private_media_owner_read_scoped" ON storage.objects;
CREATE POLICY "private_media_owner_read_scoped"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN (
    'face-verification', 'host-verification',
    'payment-proofs', 'payment-screenshots', 'helper-screenshots',
    'support-attachments', 'live-recordings'
  )
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5) User upload policies for buckets where the app uploads client-side.
DROP POLICY IF EXISTS "private_media_owner_insert_scoped" ON storage.objects;
CREATE POLICY "private_media_owner_insert_scoped"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    'face-verification', 'host-verification',
    'payment-proofs', 'payment-screenshots', 'helper-screenshots',
    'support-attachments'
  )
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "private_media_owner_update_scoped" ON storage.objects;
CREATE POLICY "private_media_owner_update_scoped"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN (
    'face-verification', 'host-verification',
    'payment-proofs', 'payment-screenshots', 'helper-screenshots',
    'support-attachments'
  )
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id IN (
    'face-verification', 'host-verification',
    'payment-proofs', 'payment-screenshots', 'helper-screenshots',
    'support-attachments'
  )
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "private_media_owner_delete_scoped" ON storage.objects;
CREATE POLICY "private_media_owner_delete_scoped"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN (
    'face-verification', 'host-verification',
    'payment-proofs', 'payment-screenshots', 'helper-screenshots',
    'support-attachments'
  )
  AND (storage.foldername(name))[1] = auth.uid()::text
);