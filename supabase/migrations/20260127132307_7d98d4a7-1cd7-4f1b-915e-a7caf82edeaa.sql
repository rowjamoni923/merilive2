-- Create payment-screenshots bucket for helper applications
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to payment-screenshots
CREATE POLICY "Authenticated users can upload payment screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-screenshots');

-- Allow public to view payment screenshots
CREATE POLICY "Public can view payment screenshots"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'payment-screenshots');

-- Allow users to update their own screenshots
CREATE POLICY "Users can update own payment screenshots"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Allow users to delete their own screenshots
CREATE POLICY "Users can delete own payment screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[2]);