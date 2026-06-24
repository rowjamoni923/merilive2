-- Re-grant EXECUTE on admin_search_closed_agencies and refresh PostgREST schema cache.
-- Authenticated owners were hitting "permission denied for function" because the
-- PostgREST role-level cache had not picked up the latest grant after the
-- function was redefined across recent migrations.

REVOKE ALL ON FUNCTION public.admin_search_closed_agencies(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_closed_agencies(text) TO authenticated, service_role;

-- Force PostgREST to reload its schema cache so the fresh grant is picked up immediately.
NOTIFY pgrst, 'reload schema';