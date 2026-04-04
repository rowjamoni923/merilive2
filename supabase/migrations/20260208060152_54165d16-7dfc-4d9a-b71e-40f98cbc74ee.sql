-- Allow admin users to update any party room (for closing rooms from admin panel)
CREATE POLICY "Admin users can update any party room"
ON public.party_rooms
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT au.user_id FROM public.admin_users au 
    WHERE au.user_id = auth.uid() 
    AND au.is_active = true
  )
);

-- Also allow admins to view ALL rooms (active and inactive) for management
CREATE POLICY "Admin users can view all party rooms"
ON public.party_rooms
FOR SELECT
USING (
  auth.uid() IN (
    SELECT au.user_id FROM public.admin_users au 
    WHERE au.user_id = auth.uid() 
    AND au.is_active = true
  )
);