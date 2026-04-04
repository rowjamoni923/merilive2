-- Allow admins to update user level tiers
CREATE POLICY "Admins can update user level tiers"
ON public.user_level_tiers
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to insert user level tiers
CREATE POLICY "Admins can insert user level tiers"
ON public.user_level_tiers
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to delete user level tiers
CREATE POLICY "Admins can delete user level tiers"
ON public.user_level_tiers
FOR DELETE
USING (public.is_admin(auth.uid()));