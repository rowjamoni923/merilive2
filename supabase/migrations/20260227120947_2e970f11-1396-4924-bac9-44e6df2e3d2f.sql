
-- Fix: Allow parent agency owners to see their sub-agencies
DROP POLICY IF EXISTS "Agency stakeholders can view full data" ON public.agencies;

CREATE POLICY "Agency stakeholders can view full data"
ON public.agencies
FOR SELECT
USING (
  owner_id = auth.uid()
  OR is_admin(auth.uid())
  OR is_agency_host(auth.uid(), id)
  OR (
    parent_agency_id IS NOT NULL 
    AND parent_agency_id IN (
      SELECT a.id FROM agencies a WHERE a.owner_id = auth.uid()
    )
  )
);
