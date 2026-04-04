-- Add INSERT policy for topup_helpers table
-- Only admins can insert new helpers (through approval process)
CREATE POLICY "Admins can insert helpers"
ON public.topup_helpers
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Also add DELETE policy for admin management
CREATE POLICY "Admins can delete helpers"
ON public.topup_helpers
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));