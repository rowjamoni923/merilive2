
-- Create storage bucket for payment gateway logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-logos', 'payment-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view payment logos (public bucket)
CREATE POLICY "Payment logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-logos');

-- Allow authenticated admins to upload payment logos
CREATE POLICY "Admins can upload payment logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-logos');

-- Allow authenticated admins to update payment logos
CREATE POLICY "Admins can update payment logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'payment-logos');

-- Allow authenticated admins to delete payment logos
CREATE POLICY "Admins can delete payment logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'payment-logos');
