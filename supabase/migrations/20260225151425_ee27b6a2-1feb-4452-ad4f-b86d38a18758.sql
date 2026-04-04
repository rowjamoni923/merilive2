
-- Step 1: Create security definer functions to break the recursion

-- Function to check if user is agency owner
CREATE OR REPLACE FUNCTION public.is_agency_owner(_user_id uuid, _agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE id = _agency_id AND owner_id = _user_id
  );
$$;

-- Function to check if user is active host in an agency
CREATE OR REPLACE FUNCTION public.is_agency_host(_user_id uuid, _agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agency_hosts
    WHERE agency_id = _agency_id AND host_id = _user_id AND status = 'active'
  );
$$;

-- Step 2: Drop the problematic policies
DROP POLICY IF EXISTS "Agency stakeholders can view full data" ON public.agencies;
DROP POLICY IF EXISTS "Agency owners can view own agency" ON public.agencies;
DROP POLICY IF EXISTS "Agency owners can view their hosts" ON public.agency_hosts;
DROP POLICY IF EXISTS "Users can view agency hosts" ON public.agency_hosts;

-- Step 3: Recreate policies using security definer functions (no recursion)

-- Agencies SELECT policy - uses is_agency_host function instead of subquery
CREATE POLICY "Agency stakeholders can view full data"
ON public.agencies
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR is_admin(auth.uid())
  OR is_agency_host(auth.uid(), id)
);

-- Agency hosts SELECT policy - uses is_agency_owner function instead of subquery
CREATE POLICY "Users can view agency hosts"
ON public.agency_hosts
FOR SELECT
TO authenticated
USING (
  host_id = auth.uid()
  OR is_admin(auth.uid())
  OR is_agency_owner(auth.uid(), agency_id)
);
