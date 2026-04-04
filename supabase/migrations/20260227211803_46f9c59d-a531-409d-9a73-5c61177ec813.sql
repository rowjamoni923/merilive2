-- Allow admin users to read all user_task_progress records
CREATE POLICY "Admin users can view all task progress"
ON public.user_task_progress
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);