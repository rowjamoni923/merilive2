-- Pkg341 pass-2: remove admin-session blanket bypass from profile protection triggers
DO $$
DECLARE
  ddl text;
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.guard_profile_call_rate()'::regprocedure,
    'public.guard_profile_gender_lock()'::regprocedure,
    'public.protect_sensitive_profile_columns()'::regprocedure
  ] LOOP
    ddl := pg_get_functiondef(fn);
    ddl := replace(ddl, E'\n     OR public.is_active_admin_session()', '');
    ddl := replace(ddl, E'\n    OR public.is_active_admin_session()', '');
    EXECUTE ddl;
  END LOOP;
END $$;