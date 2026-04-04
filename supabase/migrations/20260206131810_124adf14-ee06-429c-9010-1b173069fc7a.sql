-- Drop and recreate the admin notices policy with proper WITH CHECK
DROP POLICY IF EXISTS "Admins can manage notices" ON public.admin_notices;

CREATE POLICY "Admins can manage notices" 
ON public.admin_notices 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.user_id = auth.uid() 
    AND admin_users.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.user_id = auth.uid() 
    AND admin_users.is_active = true
  )
);