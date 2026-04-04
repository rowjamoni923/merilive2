
-- Retry: Simpler RLS policy for profiles to enable realtime
-- Drop old policy first
DROP POLICY IF EXISTS "Anyone can view profiles via public view" ON public.profiles;

-- Create simpler policy without is_real_user() dependency
CREATE POLICY "Authenticated can view non-blocked profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND is_blocked = false
);
