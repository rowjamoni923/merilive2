-- Add a public SELECT policy for profiles so profiles_public view works for all authenticated users
-- This allows any authenticated user to see other users' profiles through the view
CREATE POLICY "Anyone can view profiles via public view"
ON public.profiles
FOR SELECT
USING (
  is_real_user()
  AND is_blocked = false
);