-- Allow public read of payment method LOGO files (payment-logo-*) in payment-proofs bucket.
-- Proof screenshots (other filenames) stay private.

DROP POLICY IF EXISTS "Public read payment method logos" ON storage.objects;

CREATE POLICY "Public read payment method logos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'payment-proofs'
  AND name LIKE 'payment-logo-%'
);