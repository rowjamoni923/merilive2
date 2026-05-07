
CREATE OR REPLACE FUNCTION public.rewrite_helper_payment_logo_urls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  x integer := 0;
BEGIN
  UPDATE public.helper_country_payment_methods
     SET logo_url = REPLACE(
           logo_url,
           '/storage/v1/object/public/payment-proofs/payment-logo-',
           '/storage/v1/object/public/payment-logos/payment-logo-'
         )
   WHERE logo_url LIKE '%/payment-proofs/payment-logo-%';
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.helper_country_payment_methods
     SET icon_url = REPLACE(
           icon_url,
           '/storage/v1/object/public/payment-proofs/payment-logo-',
           '/storage/v1/object/public/payment-logos/payment-logo-'
         )
   WHERE icon_url LIKE '%/payment-proofs/payment-logo-%';
  GET DIAGNOSTICS x = ROW_COUNT;

  RETURN n + x;
END;
$$;

REVOKE ALL ON FUNCTION public.rewrite_helper_payment_logo_urls() FROM public;
GRANT EXECUTE ON FUNCTION public.rewrite_helper_payment_logo_urls() TO service_role;
