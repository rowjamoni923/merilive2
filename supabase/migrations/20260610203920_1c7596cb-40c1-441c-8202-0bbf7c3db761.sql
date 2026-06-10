GRANT EXECUTE ON FUNCTION public.is_active_admin_session() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_has_any_section_permission(text[], boolean) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.admin_has_section_permission(text, boolean)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.admin_has_section_permission(text, boolean) TO anon, authenticated, service_role;
  END IF;
  IF to_regprocedure('public.current_admin_id_from_header()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.current_admin_id_from_header() TO anon, authenticated, service_role;
  END IF;
  IF to_regprocedure('public.current_admin_token_from_header()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.current_admin_token_from_header() TO anon, authenticated, service_role;
  END IF;
END $$;