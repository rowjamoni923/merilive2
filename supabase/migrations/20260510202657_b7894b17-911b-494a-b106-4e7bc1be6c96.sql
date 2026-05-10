-- Fix: profiles_public view was SECURITY INVOKER, inheriting profiles RLS
-- which blocks reading other users' profiles → "Profile not found" on host cards.
-- Make view SECURITY DEFINER so the curated public column subset is readable
-- by all authenticated users (and anon for public host listings).
ALTER VIEW public.profiles_public SET (security_invoker = false);
ALTER VIEW public.agencies_public SET (security_invoker = false);

GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT SELECT ON public.agencies_public TO anon, authenticated;