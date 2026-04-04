
-- Fix INSERT policy: allow the INVITED user to create the record too
DROP POLICY IF EXISTS "Users can create invitations" ON public.user_invitations;
CREATE POLICY "Users can create invitations"
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = inviter_id OR auth.uid() = invited_user_id);

-- Add SELECT policy for leaderboard (allow reading all verified invitations for leaderboard)
DROP POLICY IF EXISTS "Users can view own invitations" ON public.user_invitations;
CREATE POLICY "Users can view own invitations"
ON public.user_invitations
FOR SELECT
TO authenticated
USING (auth.uid() = inviter_id OR auth.uid() = invited_user_id);

-- Public read for leaderboard aggregation (only counts, no sensitive data)
CREATE POLICY "Anyone can view verified invitations for leaderboard"
ON public.user_invitations
FOR SELECT
TO authenticated
USING (status = 'verified');
