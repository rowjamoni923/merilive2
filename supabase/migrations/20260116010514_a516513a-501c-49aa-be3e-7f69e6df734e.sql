-- Allow admins to manage helper_withdrawal_requests
CREATE POLICY "Admins can manage all helper withdrawals"
ON public.helper_withdrawal_requests
FOR ALL
USING (public.is_admin(auth.uid()));

-- Allow admins to manage helper_notifications
CREATE POLICY "Admins can manage all helper notifications"
ON public.helper_notifications
FOR ALL
USING (public.is_admin(auth.uid()));

-- Allow admins to insert helper_notifications (for sending notifications from admin)
CREATE POLICY "Admins can insert helper notifications"
ON public.helper_notifications
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to manage helper_level_config
CREATE POLICY "Admins can manage helper level config"
ON public.helper_level_config
FOR ALL
USING (public.is_admin(auth.uid()));