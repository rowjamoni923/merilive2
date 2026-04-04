-- Fix system_error_logs: Allow authenticated users to INSERT error logs
DROP POLICY IF EXISTS "No direct error log inserts" ON system_error_logs;
CREATE POLICY "Authenticated users can log errors"
ON system_error_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix system_error_logs: Allow admins to delete/update
DROP POLICY IF EXISTS "No direct error log deletes" ON system_error_logs;
DROP POLICY IF EXISTS "No direct error log updates" ON system_error_logs;

CREATE POLICY "Admins can delete error logs"
ON system_error_logs
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admins can update error logs"
ON system_error_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
);