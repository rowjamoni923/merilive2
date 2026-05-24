-- Pkg327: Gift assets stored under chat-media/gifts/ are admin-uploaded public
-- shop assets, not private DM media. Allow anonymous + authenticated reads
-- for the gifts/ prefix only. Real chat DM media (uid/* paths) remains
-- protected by chat_media_private_participant_read policy.

CREATE POLICY "chat_media_gifts_public_read"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = 'gifts'
);