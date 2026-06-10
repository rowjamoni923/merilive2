ALTER VIEW public.profiles_public SET (security_invoker = false);
ALTER VIEW public.agencies_public SET (security_invoker = false);

GRANT SELECT ON public.profiles_public TO anon;
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO service_role;

GRANT SELECT ON public.agencies_public TO anon;
GRANT SELECT ON public.agencies_public TO authenticated;
GRANT SELECT ON public.agencies_public TO service_role;

COMMENT ON VIEW public.profiles_public IS 'Public-safe profile view for app profile cards/details/search/reels/viewers. Security definer intentionally avoids private profiles owner-only RLS while exposing only selected non-sensitive fields.';
COMMENT ON VIEW public.agencies_public IS 'Public-safe agency view for discovery/details. Security definer intentionally avoids private agencies owner-only RLS while exposing only selected non-sensitive fields.';