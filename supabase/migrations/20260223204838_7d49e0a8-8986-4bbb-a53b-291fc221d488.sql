
-- Fix 1: RLS Policy Always True - restrict anon INSERT on system_error_logs
DROP POLICY IF EXISTS "Anon can insert error logs" ON public.system_error_logs;
CREATE POLICY "Anon can insert error logs with validation"
ON public.system_error_logs FOR INSERT TO anon
WITH CHECK (
  error_type IS NOT NULL AND 
  error_message IS NOT NULL AND
  length(error_message) <= 5000
);

-- Fix 2: Admin email exposure - create a restricted view for non-owner admins
-- First, make admin_users SELECT more restrictive
DROP POLICY IF EXISTS "Admins can view own record" ON public.admin_users;

-- Owners see everything, sub-admins see only their own record
CREATE POLICY "Admins can view own record only"
ON public.admin_users FOR SELECT TO authenticated
USING (
  is_real_user() AND (
    user_id = auth.uid()
  )
);

-- Owners can view all admin users
CREATE POLICY "Owners can view all admin users select"
ON public.admin_users FOR SELECT TO authenticated
USING (
  is_real_user() AND is_admin(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM admin_users au 
    WHERE au.user_id = auth.uid() AND au.role = 'owner' AND au.is_active = true
  )
);
