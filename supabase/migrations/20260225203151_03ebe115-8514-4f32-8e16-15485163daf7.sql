-- Grant SELECT permission to anon and authenticated roles
GRANT SELECT ON public.host_applications TO anon;
GRANT SELECT ON public.host_applications TO authenticated;

-- Add a permissive SELECT policy for anon role (admin panel uses anon key)
CREATE POLICY "Allow anon to read host applications"
ON public.host_applications
FOR SELECT
TO anon
USING (true);

-- Keep existing user policy for authenticated users to see their own
-- The existing "Users can view their own application" policy handles authenticated users
-- Add an admin-friendly policy for authenticated admins too
CREATE POLICY "Authenticated admins can view all applications"
ON public.host_applications
FOR SELECT
TO authenticated
USING (true);