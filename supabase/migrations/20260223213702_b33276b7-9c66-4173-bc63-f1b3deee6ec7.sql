
-- Create support-attachments storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to support-attachments
CREATE POLICY "Users can upload support attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'support-attachments' AND auth.role() = 'authenticated');

-- Anyone can view support attachments (admins need to see them)
CREATE POLICY "Public read support attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'support-attachments');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete own support attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
