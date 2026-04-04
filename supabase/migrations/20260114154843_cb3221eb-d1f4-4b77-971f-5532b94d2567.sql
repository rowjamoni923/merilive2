-- Drop the old policy
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;

-- Create new policy that works for both authenticated and anonymous authenticated users
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'chat-media' AND auth.role() = 'authenticated');