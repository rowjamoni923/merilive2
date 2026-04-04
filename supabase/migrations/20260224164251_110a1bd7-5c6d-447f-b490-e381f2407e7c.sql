-- Allow all authenticated users to read basic public profile info of other users
-- This is needed so that usernames, avatars, and display names show up correctly
-- instead of just showing user IDs
CREATE POLICY "Authenticated users can view public profiles"
ON public.profiles
FOR SELECT
USING (
  auth.role() = 'authenticated'
);
