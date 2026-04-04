-- Allow guest/anonymous users to update their online status
CREATE POLICY "Guest users can update own online status"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Drop the old restrictive policy and recreate it
-- Actually, since the new policy is more permissive and PostgreSQL ORs policies together,
-- the guest users will now match this new policy even if they don't match is_real_user().
-- But we need to be careful - let's just add a specific policy for presence updates.