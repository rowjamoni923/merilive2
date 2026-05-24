-- Pkg326 gift media — allow public read on chat-media/gifts/* so legacy gift URLs
-- (stored as /storage/v1/object/public/chat-media/gifts/<file>) work instantly
-- without physically moving files or rewriting URLs. Private DM uploads in
-- <uid>/... folders remain protected by existing recipient-scoped policy.
DROP POLICY IF EXISTS "Public read chat-media gifts folder" ON storage.objects;
CREATE POLICY "Public read chat-media gifts folder"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = 'gifts'
);