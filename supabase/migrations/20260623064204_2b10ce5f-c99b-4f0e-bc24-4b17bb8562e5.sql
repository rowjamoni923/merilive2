-- After BUG-01 (bucket made private), ensure the owning user can still read
-- their own files. Path layout from FaceVerification.tsx uploads is
-- `{auth.uid()}/<subfolder>/<filename>` so foldername(name)[1] = user id.
-- Service role bypasses RLS as always. Admin viewer uses signed URLs.
DROP POLICY IF EXISTS "Users can read their own face verification files" ON storage.objects;
CREATE POLICY "Users can read their own face verification files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'face-verification'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Also ensure users can write to their own folder (insert/update/delete on
-- their own files only). Drops any duplicate prior policy first.
DROP POLICY IF EXISTS "Users can upload their own face verification files" ON storage.objects;
CREATE POLICY "Users can upload their own face verification files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'face-verification'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update their own face verification files" ON storage.objects;
CREATE POLICY "Users can update their own face verification files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'face-verification'
  AND auth.uid()::text = (storage.foldername(name))[1]
);