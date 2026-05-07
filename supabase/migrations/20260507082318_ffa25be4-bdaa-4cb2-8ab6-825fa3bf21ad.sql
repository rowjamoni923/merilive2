
-- 1) Revert metadata moves: put the logo objects back in their real bucket
UPDATE storage.objects
   SET bucket_id = 'payment-proofs'
 WHERE bucket_id = 'payment-logos'
   AND name LIKE 'payment-logo-%';

-- 2) Revert URLs we rewrote earlier so they point to the real file location again
UPDATE public.helper_country_payment_methods
   SET logo_url = REPLACE(
         logo_url,
         '/storage/v1/object/public/payment-logos/payment-logo-',
         '/storage/v1/object/public/payment-proofs/payment-logo-'
       )
 WHERE logo_url LIKE '%/payment-logos/payment-logo-%';

UPDATE public.helper_country_payment_methods
   SET icon_url = REPLACE(
         icon_url,
         '/storage/v1/object/public/payment-logos/payment-logo-',
         '/storage/v1/object/public/payment-proofs/payment-logo-'
       )
 WHERE icon_url LIKE '%/payment-logos/payment-logo-%';

-- 3) Allow public read of helper-uploaded payment-method LOGO files only
--    (filename pattern `payment-logo-*`). Other files in payment-proofs
--    (e.g. `payment-proof-*` receipts) stay private.
DROP POLICY IF EXISTS "Public read payment-logo files in payment-proofs"
  ON storage.objects;

CREATE POLICY "Public read payment-logo files in payment-proofs"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'payment-proofs'
    AND name LIKE 'payment-logo-%'
  );
