-- Fix RLS: Allow all authenticated users to READ active helper payment methods
-- (needed for Recharge page to show payment options)

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Only helpers and admins can view country payment methods" ON public.helper_country_payment_methods;

-- Create new policy: Active methods visible to all authenticated users
-- Helpers and admins can see all (including inactive)
CREATE POLICY "Anyone can view active helper payment methods"
ON public.helper_country_payment_methods
FOR SELECT
TO authenticated
USING (
  is_active = true
  OR helper_id IN (SELECT id FROM topup_helpers WHERE user_id = auth.uid())
  OR is_admin(auth.uid())
);

-- Also check helper_payment_methods table
-- Check existing policies first and fix if needed
DROP POLICY IF EXISTS "Only helpers and admins can view payment methods" ON public.helper_payment_methods;

CREATE POLICY "Anyone can view active helper payment methods legacy"
ON public.helper_payment_methods
FOR SELECT
TO authenticated
USING (
  is_active = true
  OR helper_id IN (SELECT id FROM topup_helpers WHERE user_id = auth.uid())
  OR is_admin(auth.uid())
);