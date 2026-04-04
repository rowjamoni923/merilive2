-- Allow all authenticated users to SELECT agencies (for code checking, join flow, etc.)
-- Drop the restrictive stakeholder-only policy and replace with broader access
DROP POLICY IF EXISTS "Agency stakeholders can view full data" ON public.agencies;
CREATE POLICY "Authenticated users can view agencies"
ON public.agencies
FOR SELECT
TO authenticated
USING (true);
