-- ============================================================================
-- Pkg6: Agency, Helper & Party server-side aggregation RPCs
-- ============================================================================

-- 1) Agency overview stats (used by AdminAgencyHub + AdminAgencies inactive badge)
CREATE OR REPLACE FUNCTION public.admin_agency_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'totalAgencies', (SELECT count(*) FROM public.agencies),
    'activeAgencies', (SELECT count(*) FROM public.agencies WHERE is_active = true),
    'inactiveAgencies', (SELECT count(*) FROM public.agencies WHERE is_active = false),
    'pendingWithdrawals', (SELECT count(*) FROM public.agency_withdrawals WHERE status IN ('pending','processing')),
    'totalHelpers', (SELECT count(*) FROM public.topup_helpers WHERE is_active = true),
    'level5Helpers', (SELECT count(*) FROM public.topup_helpers WHERE trader_level = 5)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_agency_overview_stats() TO authenticated;

-- 2) Helper management stats (9 counts in one call)
CREATE OR REPLACE FUNCTION public.admin_helper_management_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'pendingApplications', (SELECT count(*) FROM public.helper_applications WHERE status = 'pending'),
    'approvedApplications', (SELECT count(*) FROM public.helper_applications WHERE status = 'approved'),
    'rejectedApplications', (SELECT count(*) FROM public.helper_applications WHERE status = 'rejected'),
    'totalHelpers', (SELECT count(*) FROM public.topup_helpers),
    'activeHelpers', (SELECT count(*) FROM public.topup_helpers WHERE is_active = true),
    'level5Helpers', (SELECT count(*) FROM public.topup_helpers WHERE trader_level = 5),
    'pendingUpgrades', (SELECT count(*) FROM public.helper_upgrade_requests WHERE status = 'pending'),
    'pendingTopups', (SELECT count(*) FROM public.helper_topup_requests WHERE status = 'pending'),
    'pendingPayroll', (SELECT count(*) FROM public.topup_helpers WHERE payroll_status = 'pending')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_helper_management_stats() TO authenticated;

-- 3) Helper applications stats
CREATE OR REPLACE FUNCTION public.admin_helper_applications_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'pending', (SELECT count(*) FROM public.helper_applications WHERE status = 'pending'),
    'approved', (SELECT count(*) FROM public.helper_applications WHERE status = 'approved'),
    'rejected', (SELECT count(*) FROM public.helper_applications WHERE status = 'rejected'),
    'pendingPayroll', (SELECT count(*) FROM public.payroll_requests WHERE status = 'pending')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_helper_applications_stats() TO authenticated;

-- 4) Helper requests stats
CREATE OR REPLACE FUNCTION public.admin_helper_requests_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'pendingUpgrades', (SELECT count(*) FROM public.helper_upgrade_requests WHERE status = 'pending'),
    'pendingTopups', (SELECT count(*) FROM public.helper_topup_requests WHERE status = 'pending')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_helper_requests_stats() TO authenticated;

-- 5) Payroll orders stats (helper_orders + agency_withdrawals)
CREATE OR REPLACE FUNCTION public.admin_payroll_orders_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_today_start timestamptz := date_trunc('day', now());
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH ho AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE status = 'processing') AS processing,
      count(*) FILTER (WHERE status = 'completed') AS completed,
      count(*) FILTER (WHERE status IN ('cancelled','failed')) AS cancelled,
      coalesce(sum(amount_usd) FILTER (WHERE created_at >= v_today_start), 0) AS today_helper_usd
    FROM public.helper_orders
  ),
  aw AS (
    SELECT
      count(*) FILTER (WHERE status = 'processing') AS processing,
      count(*) FILTER (WHERE status = 'approved') AS approved,
      count(*) FILTER (WHERE status = 'rejected') AS rejected,
      coalesce(sum(amount_usd) FILTER (WHERE created_at >= v_today_start), 0) AS today_aw_usd
    FROM public.agency_withdrawals
  )
  SELECT jsonb_build_object(
    'total', ho.total + aw.processing + aw.approved + aw.rejected,
    'pending', ho.pending,
    'processing', ho.processing + aw.processing,
    'completed', ho.completed + aw.approved,
    'cancelled', ho.cancelled + aw.rejected,
    'todayTotal', ho.today_helper_usd + aw.today_aw_usd
  )
  INTO v_result
  FROM ho, aw;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_payroll_orders_stats() TO authenticated;

-- 6) Party management stats
CREATE OR REPLACE FUNCTION public.admin_party_management_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_bg_count int := 0;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- party_room_backgrounds may or may not exist; guard it
  BEGIN
    SELECT count(*) INTO v_bg_count FROM public.party_room_backgrounds WHERE is_active = true;
  EXCEPTION WHEN undefined_table THEN
    v_bg_count := 0;
  END;

  SELECT jsonb_build_object(
    'activeRooms', (SELECT count(*) FROM public.party_rooms WHERE is_active = true),
    'inactiveRooms', (SELECT count(*) FROM public.party_rooms WHERE is_active = false),
    'totalBanners', (SELECT count(*) FROM public.party_room_banners WHERE is_active = true),
    'totalBackgrounds', v_bg_count
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_party_management_stats() TO authenticated;