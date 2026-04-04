
-- =============================================
-- CRITICAL SECURITY FIX #1: Make sensitive storage buckets private
-- =============================================
UPDATE storage.buckets SET public = false WHERE id = 'face-verification';
UPDATE storage.buckets SET public = false WHERE id = 'host-verification';

-- =============================================
-- CRITICAL SECURITY FIX #2: Restrict helper_payment_methods access
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'helper_payment_methods' AND schemaname = 'public' AND cmd = 'SELECT') THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.helper_payment_methods;', E'\n')
      FROM pg_policies 
      WHERE tablename = 'helper_payment_methods' AND schemaname = 'public' AND cmd = 'SELECT'
    );
  END IF;
END $$;

CREATE POLICY "Helpers can view own payment methods"
ON public.helper_payment_methods
FOR SELECT
TO authenticated
USING (
  helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

-- =============================================
-- CRITICAL SECURITY FIX #3: Restrict helper_country_payment_methods
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'helper_country_payment_methods' AND schemaname = 'public' AND cmd = 'SELECT') THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.helper_country_payment_methods;', E'\n')
      FROM pg_policies 
      WHERE tablename = 'helper_country_payment_methods' AND schemaname = 'public' AND cmd = 'SELECT'
    );
  END IF;
END $$;

CREATE POLICY "Only helpers and admins can view country payment methods"
ON public.helper_country_payment_methods
FOR SELECT
TO authenticated
USING (
  helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

-- =============================================
-- CRITICAL SECURITY FIX #4: Restrict agency financial data
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agencies' AND schemaname = 'public' AND cmd = 'SELECT') THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.agencies;', E'\n')
      FROM pg_policies 
      WHERE tablename = 'agencies' AND schemaname = 'public' AND cmd = 'SELECT'
    );
  END IF;
END $$;

-- Create public view hiding financial columns
CREATE OR REPLACE VIEW public.agencies_public
WITH (security_invoker = on) AS
SELECT 
  id, name, agency_code, logo_url, level, is_active,
  total_agents, total_hosts, created_at, owner_id
FROM public.agencies
WHERE is_active = true AND (is_blocked = false OR is_blocked IS NULL);

-- Full data only for owners, hosts, and admins
CREATE POLICY "Agency stakeholders can view full data"
ON public.agencies
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.agency_hosts 
    WHERE agency_hosts.agency_id = agencies.id 
    AND agency_hosts.host_id = auth.uid() 
    AND agency_hosts.status = 'active'
  )
);

-- =============================================
-- CRITICAL SECURITY FIX #5: Restrict withdrawal payment details
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agency_withdrawals' AND schemaname = 'public' AND cmd = 'SELECT') THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.agency_withdrawals;', E'\n')
      FROM pg_policies 
      WHERE tablename = 'agency_withdrawals' AND schemaname = 'public' AND cmd = 'SELECT'
    );
  END IF;
END $$;

CREATE POLICY "Withdrawal access restricted to stakeholders"
ON public.agency_withdrawals
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agencies WHERE agencies.id = agency_withdrawals.agency_id AND agencies.owner_id = auth.uid())
  OR assigned_helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
);
