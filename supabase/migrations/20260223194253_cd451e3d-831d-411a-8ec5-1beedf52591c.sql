
-- Add back a policy for authenticated users to view profiles
-- This is needed for foreign key joins across the app
-- The profiles_public view should be used for full profile display
-- This policy allows row access but app code should use profiles_public for public display
CREATE POLICY "Authenticated users can view basic profiles"
ON public.profiles
FOR SELECT
USING (
    is_real_user() AND auth.uid() IS NOT NULL
);

-- Also add column-level security comment for documentation
COMMENT ON TABLE public.profiles IS 'User profiles - use profiles_public view for public-facing queries to avoid exposing sensitive fields like coins, beans, IP, device info';
