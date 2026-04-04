-- Allow admin users to update any live stream (e.g., stop streams)
CREATE POLICY "Admins can update any stream"
ON public.live_streams
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);

-- Allow admin users to delete any live stream
CREATE POLICY "Admins can delete any stream"
ON public.live_streams
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);