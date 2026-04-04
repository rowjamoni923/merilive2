-- Fix 1: Profiles table - Remove overly permissive SELECT policies
-- Keep only: own profile (full), admin (full), others must use profiles_public view

DROP POLICY IF EXISTS "Authenticated users can view basic profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view other profiles" ON public.profiles;

-- Now only these SELECT policies remain:
-- "Users can view own full profile" (auth.uid() = id) - full access to own data
-- "Admins can view all profiles" (is_admin) - admin access to all data
-- For viewing other users, app must use profiles_public view