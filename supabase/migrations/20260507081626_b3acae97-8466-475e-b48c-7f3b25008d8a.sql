
-- The helper_country_payment_methods table has no updated_at column but a
-- generic trigger tries to set NEW.updated_at, which blocks our URL rewrite.
-- Drop the misattached trigger, then perform the moves and URL rewrite.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tgname
      FROM pg_trigger
     WHERE tgrelid = 'public.helper_country_payment_methods'::regclass
       AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.helper_country_payment_methods', r.tgname);
  END LOOP;
END $$;

-- 1) Move all helper payment logo files into the public bucket.
UPDATE storage.objects
   SET bucket_id = 'payment-logos'
 WHERE bucket_id = 'payment-proofs'
   AND name LIKE 'payment-logo-%';

-- 2) Rewrite stored URLs.
UPDATE public.helper_country_payment_methods
   SET logo_url = REPLACE(
         logo_url,
         '/storage/v1/object/public/payment-proofs/payment-logo-',
         '/storage/v1/object/public/payment-logos/payment-logo-'
       )
 WHERE logo_url LIKE '%/payment-proofs/payment-logo-%';

UPDATE public.helper_country_payment_methods
   SET icon_url = REPLACE(
         icon_url,
         '/storage/v1/object/public/payment-proofs/payment-logo-',
         '/storage/v1/object/public/payment-logos/payment-logo-'
       )
 WHERE icon_url LIKE '%/payment-proofs/payment-logo-%';
