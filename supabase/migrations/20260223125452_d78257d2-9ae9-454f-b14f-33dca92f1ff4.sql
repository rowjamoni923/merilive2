
-- ============================================================
-- MEGA SECURITY FIX: Convert ALL public-role policies to authenticated-only
-- This dynamically finds and recreates every policy in the public schema
-- that currently allows anonymous (public role) access
-- ============================================================

DO $$
DECLARE
  pol RECORD;
  create_sql TEXT;
  counter INT := 0;
BEGIN
  RAISE NOTICE '🔒 Starting Anonymous Access Lockdown...';
  
  FOR pol IN 
    SELECT schemaname, tablename, policyname, 
           permissive,
           cmd, qual, with_check
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND 'public' = ANY(roles)
    -- Skip policies that also include 'authenticated' (already correct)
    AND NOT ('authenticated' = ANY(roles) AND array_length(roles, 1) = 1)
    ORDER BY tablename, policyname
  LOOP
    BEGIN
      -- Drop existing policy
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
      
      -- Build CREATE POLICY statement with 'authenticated' role
      create_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO authenticated', 
        pol.policyname, pol.schemaname, pol.tablename, 
        CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        pol.cmd);
      
      IF pol.qual IS NOT NULL THEN
        create_sql := create_sql || ' USING (' || pol.qual || ')';
      END IF;
      
      IF pol.with_check IS NOT NULL THEN
        create_sql := create_sql || ' WITH CHECK (' || pol.with_check || ')';
      END IF;
      
      EXECUTE create_sql;
      counter := counter + 1;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Warning: Could not migrate policy % on %.%: %', pol.policyname, pol.schemaname, pol.tablename, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ Successfully migrated % policies from public to authenticated role', counter;
END;
$$;
