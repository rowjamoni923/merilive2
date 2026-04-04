-- Add INSERT policy for support-attachments bucket so users can upload images/voice
CREATE POLICY "Authenticated users can upload support attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'support-attachments' 
  AND auth.uid() IS NOT NULL 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add UPDATE policy for support-attachments bucket
CREATE POLICY "Users can update own support attachments"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'support-attachments' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);