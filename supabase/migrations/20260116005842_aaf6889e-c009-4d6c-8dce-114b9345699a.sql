-- Create policy for admins to update trader level tiers
CREATE POLICY "Admins can update trader level tiers"
ON public.trader_level_tiers
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Also add INSERT and DELETE policies for completeness
CREATE POLICY "Admins can insert trader level tiers"
ON public.trader_level_tiers
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete trader level tiers"
ON public.trader_level_tiers
FOR DELETE
USING (public.is_admin(auth.uid()));