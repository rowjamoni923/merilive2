
-- Create a security definer function to check if user is a parent agency owner
CREATE OR REPLACE FUNCTION public.is_parent_agency_owner(_user_id uuid, _agency_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE id = _agency_parent_id AND owner_id = _user_id
  );
$$;

-- Fix the agencies SELECT policy to avoid infinite recursion
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
    AND is_parent_agency_owner(auth.uid(), parent_agency_id)
  )
);
