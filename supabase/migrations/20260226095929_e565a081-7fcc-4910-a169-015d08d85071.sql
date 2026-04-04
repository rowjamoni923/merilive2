-- Fix: Remove overly permissive profile SELECT policy
-- Keep: "Users can view own full profile" and "Admins can view all profiles"
-- The app should use profiles_public view for other users' data

DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;
