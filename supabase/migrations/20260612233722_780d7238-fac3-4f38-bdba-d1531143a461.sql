
-- 1) Rebuild payouts function to also include game winnings paid to users
CREATE OR REPLACE FUNCTION public.compute_payouts_for_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  category_key TEXT,
  display_name TEXT,
  payout_usd NUMERIC,
  payout_diamonds NUMERIC,
  transaction_count BIGINT,
  recipient_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coin_rate NUMERIC;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  v_coin_rate := public.get_official_coin_usd_rate();

  RETURN QUERY
  SELECT 'agency_withdrawal'::text, 'Agency Withdrawals'::text,
         ROUND(COALESCE(SUM(COALESCE(net_amount_money, usd_amount, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(net_diamonds_to_helper,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT agency_id)::bigint
  FROM public.agency_withdrawals
  WHERE status IN ('completed','approved','paid')
    AND COALESCE(processed_at, requested_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_withdrawal', 'Helper Withdrawals',
         ROUND(COALESCE(SUM(COALESCE(helper_net_reward, usd_amount, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(diamond_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_withdrawal_requests
  WHERE status IN ('completed','approved','paid')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_topup', 'Helper Diamond Top-ups',
         ROUND(COALESCE(SUM(COALESCE(amount_usd, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(coin_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_topup_requests
  WHERE status IN ('completed','approved')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_commission', 'Helper Order Commissions',
         ROUND(COALESCE(SUM(COALESCE(commission_amount,0)),0)::numeric, 4),
         0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_orders
  WHERE status IN ('completed','approved','delivered')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'host_payroll', 'Host Payroll Payouts',
         ROUND(COALESCE(SUM(COALESCE(usd_amount,0)),0)::numeric, 4),
         0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.payroll_requests
  WHERE status IN ('completed','approved','paid')
    AND COALESCE(reviewed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'agency_host_transfer', 'Agency → Host Earnings',
         ROUND(COALESCE(SUM(amount),0)::numeric, 4),
         0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT host_id)::bigint
  FROM public.agency_earnings_transfers
  WHERE COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'beans_exchange', 'Beans → Diamonds Reward',
         ROUND((COALESCE(SUM(diamonds_reward),0) * v_coin_rate)::numeric, 4),
         COALESCE(SUM(diamonds_reward),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.user_beans_exchanges
  WHERE status IN ('completed','approved')
    AND COALESCE(completed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- NEW: Game winnings paid to users
  SELECT 'game_winnings', 'Game Winnings (User Wins)',
         ROUND((COALESCE(SUM(COALESCE(win_amount,0)),0) * v_coin_rate)::numeric, 4),
         COALESCE(SUM(COALESCE(win_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.game_transactions
  WHERE created_at BETWEEN p_start AND p_end
    AND COALESCE(win_amount,0) > 0;
END $$;

-- 2) Company Health Score — compares net profit vs payouts
CREATE OR REPLACE FUNCTION public.compute_company_health(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  company_profit_usd NUMERIC,
  total_payouts_usd NUMERIC,
  net_balance_usd NUMERIC,
  health_percent NUMERIC,
  status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profit NUMERIC := 0;
  v_payouts NUMERIC := 0;
  v_health NUMERIC := 100;
  v_status TEXT := 'healthy';
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT COALESCE(SUM(net_profit_usd),0)
    INTO v_profit
  FROM public.compute_profit_for_range(p_start, p_end);

  SELECT COALESCE(SUM(payout_usd),0)
    INTO v_payouts
  FROM public.compute_payouts_for_range(p_start, p_end);

  -- Ratio: 100% when profit >> payouts, 50% when equal, 0% when profit=0
  IF (v_profit + v_payouts) <= 0 THEN
    v_health := 100; -- no activity = neutral healthy
  ELSE
    v_health := ROUND((v_profit / (v_profit + v_payouts)) * 100, 2);
    IF v_health < 0 THEN v_health := 0; END IF;
    IF v_health > 100 THEN v_health := 100; END IF;
  END IF;

  v_status := CASE
    WHEN v_health >= 90 THEN 'healthy'
    WHEN v_health >= 70 THEN 'good'
    WHEN v_health >= 50 THEN 'caution'
    WHEN v_health >= 30 THEN 'warning'
    ELSE 'critical'
  END;

  company_profit_usd := ROUND(v_profit, 4);
  total_payouts_usd := ROUND(v_payouts, 4);
  net_balance_usd := ROUND(v_profit - v_payouts, 4);
  health_percent := v_health;
  status := v_status;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.compute_payouts_for_range(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_payouts_for_range(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.compute_company_health(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_company_health(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;
