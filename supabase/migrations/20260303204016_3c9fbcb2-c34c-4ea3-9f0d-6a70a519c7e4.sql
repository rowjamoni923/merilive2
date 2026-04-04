-- Allow sub-admins to update their own display_name and whatsapp_number
DROP POLICY IF EXISTS "Admins can update own profile" ON public.admin_users;
CREATE POLICY "Admins can update own profile"
ON public.admin_users FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Also allow sub-admins to SELECT their own record (fix view policy to not require is_admin)
DROP POLICY IF EXISTS "Admins can view own record only" ON public.admin_users;
CREATE POLICY "Admins can view own record"
ON public.admin_users FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));