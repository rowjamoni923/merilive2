
-- ============================================================
-- PART 1: Enhance recharge_transactions for full purchase tracking
-- ============================================================

-- Add detailed tracking columns to recharge_transactions
ALTER TABLE public.recharge_transactions
ADD COLUMN IF NOT EXISTS purchase_source text DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS local_payment_number text,
ADD COLUMN IF NOT EXISTS local_payment_provider text,
ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id),
ADD COLUMN IF NOT EXISTS agency_name text,
ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS agent_name text,
ADD COLUMN IF NOT EXISTS google_order_id text,
ADD COLUMN IF NOT EXISTS google_product_id text,
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS local_currency_amount numeric,
ADD COLUMN IF NOT EXISTS ip_address text,
ADD COLUMN IF NOT EXISTS device_info jsonb,
ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.recharge_transactions.purchase_source IS 'google_play, local_agent, local_helper, admin_manual, promotion';
COMMENT ON COLUMN public.recharge_transactions.local_payment_number IS 'Phone number or account used for local payment';
COMMENT ON COLUMN public.recharge_transactions.local_payment_provider IS 'bKash, Nagad, Rocket, bank_transfer, etc.';

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_recharge_purchase_source ON public.recharge_transactions(purchase_source);
CREATE INDEX IF NOT EXISTS idx_recharge_agency ON public.recharge_transactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_recharge_user ON public.recharge_transactions(user_id);

-- ============================================================
-- PART 2: Fix all "RLS Policy Always True" for INSERT/UPDATE/DELETE
-- ============================================================

-- Fix overly permissive policies found by linter

-- agency_level_tiers: admin-only modifications
DROP POLICY IF EXISTS "Admins can delete agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Only admins can delete agency level tiers"
ON public.agency_level_tiers FOR DELETE
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Only admins can update agency level tiers"
ON public.agency_level_tiers FOR UPDATE
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admins can modify agency level tiers" ON public.agency_level_tiers;
CREATE POLICY "Only admins can insert agency level tiers"
ON public.agency_level_tiers FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- agency_performance: block direct user updates
DROP POLICY IF EXISTS "Agency owners can update own performance" ON public.agency_performance;
CREATE POLICY "No direct performance updates"
ON public.agency_performance FOR UPDATE
USING (false);

-- Secure recharge_transactions: only system/admin can insert
DROP POLICY IF EXISTS "Users can view own recharges" ON public.recharge_transactions;
CREATE POLICY "Users can view own recharges"
ON public.recharge_transactions FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "No direct recharge inserts" ON public.recharge_transactions;
CREATE POLICY "No direct recharge inserts"
ON public.recharge_transactions FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct recharge updates" ON public.recharge_transactions;
CREATE POLICY "No direct recharge updates"
ON public.recharge_transactions FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct recharge deletes" ON public.recharge_transactions;
CREATE POLICY "No direct recharge deletes"
ON public.recharge_transactions FOR DELETE
USING (false);

-- ============================================================
-- PART 3: Restrict all admin tables to authenticated only
-- ============================================================

-- Fix anonymous access on admin tables by adding explicit role checks
-- These policies should only work for 'authenticated' role

-- admin_allowed_devices
DROP POLICY IF EXISTS "Owners can manage all devices" ON public.admin_allowed_devices;
CREATE POLICY "Owners can manage all devices"
ON public.admin_allowed_devices FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can view all devices" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Sub-admins can view own devices" ON public.admin_allowed_devices;
CREATE POLICY "Admins can view devices"
ON public.admin_allowed_devices FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()) OR admin_user_id IN (
  SELECT id FROM public.admin_users WHERE user_id = auth.uid()
));

-- admin_invitations
DROP POLICY IF EXISTS "Owners can manage invitations" ON public.admin_invitations;
CREATE POLICY "Owners can manage invitations"
ON public.admin_invitations FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- admin_logs: read-only for admins
DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;
CREATE POLICY "Admins can view logs"
ON public.admin_logs FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- admin_users: restrict to authenticated
DROP POLICY IF EXISTS "Admins can view own record" ON public.admin_users;
CREATE POLICY "Admins can view own record"
ON public.admin_users FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
CREATE POLICY "No direct admin deletes"
ON public.admin_users FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
CREATE POLICY "No direct admin updates"
ON public.admin_users FOR UPDATE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "Owners can manage all admin users" ON public.admin_users;
CREATE POLICY "Owners can manage all admin users"
ON public.admin_users FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- admin_sections: restrict to authenticated
DROP POLICY IF EXISTS "Admins can view active sections" ON public.admin_sections;
CREATE POLICY "Admins can view active sections"
ON public.admin_sections FOR SELECT
TO authenticated
USING (is_active = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage sections" ON public.admin_sections;
CREATE POLICY "Owners can manage sections"
ON public.admin_sections FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- admin_stats: restrict to authenticated admins
DROP POLICY IF EXISTS "Admins can view stats" ON public.admin_stats;
CREATE POLICY "Admins can view stats"
ON public.admin_stats FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- admin_section_permissions: restrict to authenticated
DROP POLICY IF EXISTS "Admins can view own permissions" ON public.admin_section_permissions;
CREATE POLICY "Admins can view own permissions"
ON public.admin_section_permissions FOR SELECT
TO authenticated
USING (admin_user_id IN (
  SELECT id FROM public.admin_users WHERE user_id = auth.uid()
) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage permissions" ON public.admin_section_permissions;
CREATE POLICY "Owners can manage permissions"
ON public.admin_section_permissions FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
