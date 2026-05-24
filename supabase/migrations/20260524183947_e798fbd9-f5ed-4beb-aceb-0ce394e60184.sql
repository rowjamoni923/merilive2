-- 1) Make face-verification bucket private (it stores KYC selfies + liveness videos)
UPDATE storage.buckets SET public = false WHERE id = 'face-verification';

-- 2) Drop overly-broad ALL policy that allowed any authenticated user to INSERT
--    into ANY storage bucket as long as they set owner = auth.uid().
--    Bucket-specific owner_upload_* policies + admin-session policy still cover
--    every legitimate upload path.
DROP POLICY IF EXISTS "Owner/Admin Modification Access" ON storage.objects;

-- 3) Drop cross-bucket "Authenticated users can update/delete own files" — these
--    are superseded by the bucket-specific owner_update_* / owner_delete_*
--    policies and were the same shape (auth.uid() = owner) that enabled the
--    issue above for UPDATE/DELETE on admin buckets.
DROP POLICY IF EXISTS "Authenticated users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own files" ON storage.objects;

-- 4) Also drop the legacy duplicate public-read policy for app-assets (already
--    covered by the consolidated "Public read for public buckets" policy).
DROP POLICY IF EXISTS "Public read access for app-assets" ON storage.objects;