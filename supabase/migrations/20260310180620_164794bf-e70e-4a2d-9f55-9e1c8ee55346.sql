-- Fix agencies_public view: remove security_invoker so anon users can read
-- This is critical for SmartLink / BrowserAgencyForm to work for unauthenticated visitors
DROP VIEW IF EXISTS public.agencies_public;

CREATE VIEW public.agencies_public AS
SELECT 
  id, name, agency_code, logo_url, level, is_active,
  total_agents, total_hosts, created_at, owner_id
FROM public.agencies
WHERE is_active = true AND (is_blocked = false OR is_blocked IS NULL);

-- Ensure grants
GRANT SELECT ON public.agencies_public TO anon;
GRANT SELECT ON public.agencies_public TO authenticated;