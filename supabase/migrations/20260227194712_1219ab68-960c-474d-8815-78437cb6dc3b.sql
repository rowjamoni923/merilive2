-- Allow admins to delete any reel
DROP POLICY IF EXISTS "Users can delete own reels" ON public.reels;

CREATE POLICY "Users can delete own reels"
ON public.reels
FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);