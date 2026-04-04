-- ============================================================
-- BLOCK ANONYMOUS AUTHENTICATED USERS from sensitive tables
-- Anonymous sign-ups get 'authenticated' role but have no email/phone
-- This adds is_real_user() check to all financial & admin policies
-- ============================================================

DO $$
DECLARE
  sensitive_tables TEXT[] := ARRAY[
    'recharge_transactions', 'coin_transfers', 'gift_transactions', 
    'game_transactions', 'agency_withdrawals', 'agency_diamond_transactions',
    'agency_earnings_transfers', 'agency_commission_history',
    'admin_users', 'admin_logs', 'admin_section_permissions', 
    'admin_sections', 'admin_stats', 'admin_allowed_devices',
    'admin_invitations', 'admin_notices',
    'topup_helpers', 'topup_orders',
    'profiles', 'coin_packages', 'wallet_transactions'
  ];
  tbl TEXT;
  pol RECORD;
  create_sql TEXT;
  counter INT := 0;
BEGIN
  FOREACH tbl IN ARRAY sensitive_tables
  LOOP
    -- Check if table exists
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      CONTINUE;
    END IF;

    FOR pol IN 
      SELECT policyname, permissive, cmd, qual, with_check
      FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = tbl
      AND roles::text[] = ARRAY['authenticated']::text[]
    LOOP
      BEGIN
        -- Drop existing
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
        
        -- Rebuild with is_real_user() added
        create_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO authenticated',
          pol.policyname, tbl,
          CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          pol.cmd);
        
        IF pol.qual IS NOT NULL THEN
          -- Add is_real_user() check to existing USING clause
          create_sql := create_sql || ' USING (public.is_real_user() AND (' || pol.qual || '))';
        ELSE
          create_sql := create_sql || ' USING (public.is_real_user())';
        END IF;
        
        IF pol.with_check IS NOT NULL THEN
          create_sql := create_sql || ' WITH CHECK (public.is_real_user() AND (' || pol.with_check || '))';
        END IF;
        
        EXECUTE create_sql;
        counter := counter + 1;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipped policy % on %: %', pol.policyname, tbl, SQLERRM;
      END;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Updated % policies with is_real_user() check', counter;
END;
$$;
