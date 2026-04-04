-- Allow admins to view all face violations
CREATE POLICY "Admins can view all face violations"
ON public.live_face_violations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Allow admins to update face violations (for review actions)
CREATE POLICY "Admins can update face violations"
ON public.live_face_violations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() AND is_active = true
  )
);