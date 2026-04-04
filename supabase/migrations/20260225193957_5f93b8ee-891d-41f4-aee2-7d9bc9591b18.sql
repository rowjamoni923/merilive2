-- Grant SELECT permission to authenticated users on payment method tables
GRANT SELECT ON public.helper_country_payment_methods TO authenticated;
GRANT SELECT ON public.helper_payment_methods TO authenticated;

-- topup_helpers also needs SELECT for the RLS subquery to work
GRANT SELECT ON public.topup_helpers TO authenticated;

-- Remove duplicate/old SELECT policy on helper_payment_methods
DROP POLICY IF EXISTS "Helpers can view own payment methods" ON public.helper_payment_methods;