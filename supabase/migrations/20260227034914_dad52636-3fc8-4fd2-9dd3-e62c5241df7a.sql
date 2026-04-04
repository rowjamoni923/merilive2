-- Fix: Remove is_real_user() from topup_helpers RLS policies
-- SM Agent is is_anonymous=true so is_real_user() returns false, blocking helper access

DROP POLICY IF EXISTS "Helpers can view own data" ON public.topup_helpers;
CREATE POLICY "Helpers can view own data" 
ON public.topup_helpers FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view active helpers" ON public.topup_helpers;
CREATE POLICY "Anyone can view active helpers" 
ON public.topup_helpers FOR SELECT TO authenticated
USING (is_active = true AND is_verified = true);

DROP POLICY IF EXISTS "Helpers can update limited own data" ON public.topup_helpers;
CREATE POLICY "Helpers can update limited own data" 
ON public.topup_helpers FOR UPDATE TO authenticated
USING (user_id = auth.uid());