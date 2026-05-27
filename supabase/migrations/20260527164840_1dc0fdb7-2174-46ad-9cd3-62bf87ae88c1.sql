-- ============================================================
-- Pkg377: Admin Recharge Pricing Lockdown
-- coin_packages / first_recharge_bonus / recharge_campaigns
-- ============================================================

-- ---- coin_packages ----
DROP POLICY IF EXISTS "Admin session full access" ON public.coin_packages;
DROP POLICY IF EXISTS "Admins can manage coin packages" ON public.coin_packages;
DROP POLICY IF EXISTS "Admins can manage packages" ON public.coin_packages;
DROP POLICY IF EXISTS "No direct coin_package inserts" ON public.coin_packages;
DROP POLICY IF EXISTS "No direct coin_package updates" ON public.coin_packages;
DROP POLICY IF EXISTS "No direct coin_package deletes" ON public.coin_packages;
DROP POLICY IF EXISTS "pkg377_coin_packages_admin_select" ON public.coin_packages;
DROP POLICY IF EXISTS "pkg377_coin_packages_admin_write" ON public.coin_packages;

CREATE POLICY "pkg377_coin_packages_admin_select"
ON public.coin_packages FOR SELECT TO anon, authenticated
USING (is_active_admin_session());

CREATE POLICY "pkg377_coin_packages_admin_write"
ON public.coin_packages FOR ALL TO anon, authenticated
USING (
  public.admin_has_any_section_permission(
    ARRAY['finance-hub','coin-packages','topup-system','manual-topup'], true
  )
)
WITH CHECK (
  public.admin_has_any_section_permission(
    ARRAY['finance-hub','coin-packages','topup-system','manual-topup'], true
  )
);

-- ---- first_recharge_bonus ----
DROP POLICY IF EXISTS "Admin session full access" ON public.first_recharge_bonus;
DROP POLICY IF EXISTS "Admins can manage first recharge bonus" ON public.first_recharge_bonus;
DROP POLICY IF EXISTS "pkg377_first_recharge_bonus_admin_select" ON public.first_recharge_bonus;
DROP POLICY IF EXISTS "pkg377_first_recharge_bonus_admin_write" ON public.first_recharge_bonus;

CREATE POLICY "pkg377_first_recharge_bonus_admin_select"
ON public.first_recharge_bonus FOR SELECT TO anon, authenticated
USING (is_active_admin_session());

CREATE POLICY "pkg377_first_recharge_bonus_admin_write"
ON public.first_recharge_bonus FOR ALL TO anon, authenticated
USING (
  public.admin_has_any_section_permission(
    ARRAY['finance-hub','first-recharge','coin-packages'], true
  )
)
WITH CHECK (
  public.admin_has_any_section_permission(
    ARRAY['finance-hub','first-recharge','coin-packages'], true
  )
);

-- ---- recharge_campaigns ----
DROP POLICY IF EXISTS "Admin session full access" ON public.recharge_campaigns;
DROP POLICY IF EXISTS "pkg377_recharge_campaigns_admin_select" ON public.recharge_campaigns;
DROP POLICY IF EXISTS "pkg377_recharge_campaigns_admin_write" ON public.recharge_campaigns;

CREATE POLICY "pkg377_recharge_campaigns_admin_select"
ON public.recharge_campaigns FOR SELECT TO anon, authenticated
USING (is_active_admin_session());

CREATE POLICY "pkg377_recharge_campaigns_admin_write"
ON public.recharge_campaigns FOR ALL TO anon, authenticated
USING (
  public.admin_has_any_section_permission(
    ARRAY['finance-hub','coin-packages','topup-system'], true
  )
)
WITH CHECK (
  public.admin_has_any_section_permission(
    ARRAY['finance-hub','coin-packages','topup-system'], true
  )
);