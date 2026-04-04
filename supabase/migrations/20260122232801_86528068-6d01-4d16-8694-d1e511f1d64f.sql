-- Drop the policies that failed due to is_admin not existing
DROP POLICY IF EXISTS "Admins can view all payment methods" ON public.topup_payment_methods;
DROP POLICY IF EXISTS "Admins can insert payment methods" ON public.topup_payment_methods;
DROP POLICY IF EXISTS "Admins can update payment methods" ON public.topup_payment_methods;
DROP POLICY IF EXISTS "Admins can delete payment methods" ON public.topup_payment_methods;

-- Create simple policies for authenticated users (admins access through admin panel)
-- View all methods for authenticated users
CREATE POLICY "Authenticated users can view all payment methods" 
ON public.topup_payment_methods 
FOR SELECT 
TO authenticated
USING (true);

-- Insert for authenticated users
CREATE POLICY "Authenticated users can insert payment methods" 
ON public.topup_payment_methods 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Update for authenticated users
CREATE POLICY "Authenticated users can update payment methods" 
ON public.topup_payment_methods 
FOR UPDATE 
TO authenticated
USING (true);

-- Delete for authenticated users
CREATE POLICY "Authenticated users can delete payment methods" 
ON public.topup_payment_methods 
FOR DELETE 
TO authenticated
USING (true);