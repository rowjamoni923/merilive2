-- Allow agency owners to SELECT their own agency
CREATE POLICY "Agency owners can view own agency"
ON public.agencies
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());
