
-- =============================================
-- FIX: Agency owners cannot access their own data
-- Root cause of dashboard crashes
-- =============================================

-- 1. agencies: owner can SELECT and UPDATE their own agency
CREATE POLICY "owner_select_own_agency"
  ON public.agencies FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner_update_own_agency"
  ON public.agencies FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 2. agency_hosts: agency owner can SELECT, INSERT, UPDATE hosts
CREATE POLICY "owner_select_agency_hosts"
  ON public.agency_hosts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      WHERE a.id = agency_hosts.agency_id AND a.owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_insert_agency_hosts"
  ON public.agency_hosts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies a
      WHERE a.id = agency_hosts.agency_id AND a.owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_agency_hosts"
  ON public.agency_hosts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      WHERE a.id = agency_hosts.agency_id AND a.owner_id = auth.uid()
    )
  );

-- 3. topup_helpers: user can read own helper record
CREATE POLICY "user_select_own_helper"
  ON public.topup_helpers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. agency_withdrawals: agency owner can SELECT and INSERT
CREATE POLICY "owner_select_withdrawals"
  ON public.agency_withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      WHERE a.id = agency_withdrawals.agency_id AND a.owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_insert_withdrawals"
  ON public.agency_withdrawals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies a
      WHERE a.id = agency_withdrawals.agency_id AND a.owner_id = auth.uid()
    )
  );

-- 5. helper_orders: helper can see orders assigned to them
CREATE POLICY "helper_select_own_orders"
  ON public.helper_orders FOR SELECT TO authenticated
  USING (helper_id IN (
    SELECT id FROM topup_helpers WHERE user_id = auth.uid()
  ));

CREATE POLICY "helper_update_own_orders"
  ON public.helper_orders FOR UPDATE TO authenticated
  USING (helper_id IN (
    SELECT id FROM topup_helpers WHERE user_id = auth.uid()
  ));

-- 6. agency_commission_history: owner can view
CREATE POLICY "owner_select_commission_history"
  ON public.agency_commission_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      WHERE a.id = agency_commission_history.agency_id AND a.owner_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );
