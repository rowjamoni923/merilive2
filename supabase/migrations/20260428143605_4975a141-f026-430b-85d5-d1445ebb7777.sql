-- Aggregated payment gateway stats (used by AdminPaymentGateways)
CREATE OR REPLACE FUNCTION public.admin_payment_gateway_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_pending bigint;
  v_completed bigint;
  v_revenue numeric;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.payment_transactions;
  SELECT COUNT(*) INTO v_pending FROM public.payment_transactions WHERE status = 'pending';
  SELECT COUNT(*) INTO v_completed FROM public.payment_transactions WHERE status = 'completed';
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_revenue FROM public.payment_transactions WHERE status = 'completed';

  RETURN jsonb_build_object(
    'total_transactions', v_total,
    'pending_transactions', v_pending,
    'completed_transactions', v_completed,
    'total_revenue', v_revenue
  );
END $$;

-- Aggregated withdrawal stats (used by AdminWithdrawals)
CREATE OR REPLACE FUNCTION public.admin_withdrawal_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending bigint;
  v_approved bigint;
  v_pending_amount numeric;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_pending FROM public.agency_withdrawals WHERE status = 'pending';
  SELECT COUNT(*) INTO v_approved FROM public.agency_withdrawals WHERE status = 'approved';
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_amount FROM public.agency_withdrawals WHERE status = 'pending';

  RETURN jsonb_build_object(
    'pending', v_pending,
    'approved', v_approved,
    'total_pending_amount', v_pending_amount
  );
END $$;

-- Finance overview stats (used by AdminFinance hub)
CREATE OR REPLACE FUNCTION public.admin_finance_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_withdrawals bigint;
  v_today_transfers bigint;
  v_pending_epay bigint;
  v_today_start timestamptz := date_trunc('day', now());
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_pending_withdrawals FROM public.agency_withdrawals WHERE status = 'pending';
  SELECT COUNT(*) INTO v_today_transfers FROM public.coin_transfers WHERE created_at >= v_today_start;
  SELECT COUNT(*) INTO v_pending_epay FROM public.agency_withdrawals WHERE status = 'pending' AND payment_method = 'epay';

  RETURN jsonb_build_object(
    'pending_withdrawals', v_pending_withdrawals,
    'today_transfers', v_today_transfers,
    'pending_epay', v_pending_epay
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_payment_gateway_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_withdrawal_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_overview_stats() TO authenticated, anon;