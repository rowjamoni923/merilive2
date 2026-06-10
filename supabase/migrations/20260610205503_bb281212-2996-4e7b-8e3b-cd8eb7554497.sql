
-- Restore grants on every public base table
DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', tbl.table_name);
  END LOOP;
END $$;

-- Restore grants on every public view
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname AS view_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('v','m') AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v.view_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', v.view_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v.view_name);
  END LOOP;
END $$;

-- Restore grants on every public sequence
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT c.relname AS seq_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', s.seq_name);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', s.seq_name);
  END LOOP;
END $$;

-- Restore EXECUTE on every public function (RLS + SECURITY DEFINER still enforce access)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', f.proname, f.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', f.proname, f.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', f.proname, f.args);
    EXCEPTION WHEN OTHERS THEN
      -- skip functions that can't be granted (aggregates etc.)
      NULL;
    END;
  END LOOP;
END $$;
