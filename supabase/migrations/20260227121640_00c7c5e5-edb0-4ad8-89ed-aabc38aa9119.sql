
-- Fix 1: Grant anon access to device_tokens (anonymous users need to register push tokens)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO anon;

-- Fix 2: Grant anon SELECT on agencies (needed for public agency list views, join agency flow)
GRANT SELECT ON public.agencies TO anon;

-- Fix 3: Grant anon SELECT on agency_hosts (needed for public agency views)
GRANT SELECT ON public.agency_hosts TO anon;

-- Fix 4: Ensure agencies_public view is accessible
GRANT SELECT ON public.agencies_public TO anon;
GRANT SELECT ON public.agencies_public TO authenticated;
