-- Add UPDATE policies for admins on helper_upgrade_requests
CREATE POLICY "Admins can update upgrade requests"
ON public.helper_upgrade_requests
FOR UPDATE
USING (is_admin(auth.uid()));

-- Add UPDATE policies for admins on helper_topup_requests  
CREATE POLICY "Admins can update topup requests"
ON public.helper_topup_requests
FOR UPDATE
USING (is_admin(auth.uid()));

-- Add SELECT all policy for admins on helper_upgrade_requests
CREATE POLICY "Admins can view all upgrade requests"
ON public.helper_upgrade_requests
FOR SELECT
USING (is_admin(auth.uid()));

-- Add SELECT all policy for admins on helper_topup_requests
CREATE POLICY "Admins can view all topup requests"
ON public.helper_topup_requests
FOR SELECT
USING (is_admin(auth.uid()));