-- Allow agency owners to update their own agency's total_hosts and total_agents
DROP POLICY IF EXISTS "Only admins can update agencies" ON public.agencies;

-- Admins can update anything
CREATE POLICY "Admins can update agencies"
ON public.agencies FOR UPDATE
USING (is_admin(auth.uid()));

-- Agency owners can update their own agency (limited columns enforced by app logic)
CREATE POLICY "Owners can update own agency stats"
ON public.agencies FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);