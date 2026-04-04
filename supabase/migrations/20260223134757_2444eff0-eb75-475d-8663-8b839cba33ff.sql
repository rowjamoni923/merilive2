-- Fix 1: Set search_path on update_game_stats function
ALTER FUNCTION public.update_game_stats SET search_path = public;

-- Fix 2: Create a trigger to block anonymous sign-ups from being exploited
-- This ensures that even if anon signups are enabled in Supabase auth settings,
-- anonymous users cannot access any data through RLS (already done via authenticated-only policies)
-- But we add an extra layer: a function to verify real users in critical operations

CREATE OR REPLACE FUNCTION public.is_real_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND (email IS NOT NULL OR phone IS NOT NULL)
    AND is_anonymous IS NOT TRUE
  )
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.is_real_user() IS 'Returns true only for non-anonymous authenticated users with email or phone';
