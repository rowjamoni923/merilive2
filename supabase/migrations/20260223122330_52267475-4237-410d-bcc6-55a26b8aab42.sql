
-- Fix: Any authenticated user can INSERT game_settings - CRITICAL!
DROP POLICY IF EXISTS "Authenticated can insert games" ON public.game_settings;
CREATE POLICY "Only admins can insert game settings"
ON public.game_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Fix: Any authenticated user can INSERT helper_admin_messages
-- This should be restricted to helpers and admins only
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.helper_admin_messages;
CREATE POLICY "Helpers and admins can insert messages"
ON public.helper_admin_messages FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.topup_helpers 
    WHERE user_id = auth.uid() AND is_active = true
  )
);
