
-- Pkg380: Admin panel deeper gap closure (Pkg379 pass-2)
-- Gap 1: admin_users has 4 SELECT policies but ZERO SELECT grant to anon/authenticated
--        → PostgREST returns "permission denied" for any read; AdminAccessGuard / AdminUsers list / sub-admin role check all broken.
--        Policies already gate via is_admin_session()/is_admin(auth.uid()) so granting SELECT is safe.
GRANT SELECT ON public.admin_users TO anon, authenticated;

-- Gap 2: Two admin-callable SECDEF RPCs missing anon EXECUTE.
--        Admin panel uses adminSupabase (anon key + x-admin-token header) → role=anon.
--        Both RPCs have internal admin-header verification (current_admin_id_from_header / is_caller_admin) so anon grant is safe.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef=true
      AND p.proname IN ('approve_agency_withdrawal','assign_payroll_to_trader')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon', r.nspname, r.proname, r.args);
  END LOOP;
END $$;
