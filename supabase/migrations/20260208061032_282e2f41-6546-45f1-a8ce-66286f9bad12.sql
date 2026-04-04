-- Allow admin users to INSERT backgrounds
CREATE POLICY "Admin users can insert party room backgrounds"
ON public.party_room_backgrounds
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT au.user_id FROM public.admin_users au 
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

-- Allow admin users to UPDATE backgrounds
CREATE POLICY "Admin users can update party room backgrounds"
ON public.party_room_backgrounds
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT au.user_id FROM public.admin_users au 
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

-- Allow admin users to DELETE backgrounds
CREATE POLICY "Admin users can delete party room backgrounds"
ON public.party_room_backgrounds
FOR DELETE
USING (
  auth.uid() IN (
    SELECT au.user_id FROM public.admin_users au 
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

-- Allow admins to view ALL backgrounds (including inactive) for management
CREATE POLICY "Admin users can view all party room backgrounds"
ON public.party_room_backgrounds
FOR SELECT
USING (
  auth.uid() IN (
    SELECT au.user_id FROM public.admin_users au 
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);