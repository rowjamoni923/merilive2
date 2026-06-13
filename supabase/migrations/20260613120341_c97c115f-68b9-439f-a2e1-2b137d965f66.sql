
-- ============================================================
-- 100% accurate profit/payout accounting — no double-counting
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_profit_for_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(sector_key text, display_name text, gross_revenue_usd numeric, company_cut_usd numeric, payouts_usd numeric, gateway_cost_usd numeric, net_profit_usd numeric, transaction_count bigint, company_cut_percent numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_coin_rate NUMERIC;
  v_bean_rate NUMERIC;
  v_recharge_gateway_pct NUMERIC := 0;
  v_vip_gateway_pct NUMERIC := 0;
  v_sub_gateway_pct NUMERIC := 0;
BEGIN
  IF NOT public.is_admin_request() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  v_coin_rate := public.get_official_coin_usd_rate();
  v_bean_rate := v_coin_rate;

  SELECT COALESCE(gateway_cost_percent,0) INTO v_recharge_gateway_pct FROM public.profit_config WHERE sector_key='recharge' AND is_active LIMIT 1;
  SELECT COALESCE(gateway_cost_percent,0) INTO v_vip_gateway_pct      FROM public.profit_config WHERE sector_key='vip_subscription' AND is_active LIMIT 1;
  SELECT COALESCE(gateway_cost_percent,0) INTO v_sub_gateway_pct      FROM public.profit_config WHERE sector_key='subscription_order' AND is_active LIMIT 1;

  RETURN QUERY
  -- ============ REAL EXTERNAL USD REVENUE (no double-count) ============
  -- 1) Official recharge (Play Store / gateway): real USD in
  SELECT 'recharge'::text, 'Official Recharge'::text,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric,4) AS gross,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric * (1 - v_recharge_gateway_pct/100.0),4) AS company_cut,
    0::numeric AS payouts,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric * (v_recharge_gateway_pct/100.0),4) AS gateway_cost,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric * (1 - v_recharge_gateway_pct/100.0),4) AS net_profit,
    COUNT(*)::bigint, (100 - v_recharge_gateway_pct)::numeric
  FROM public.recharge_transactions rt
  WHERE rt.status IN ('completed','approved')
    AND COALESCE(rt.processed_at, rt.created_at) BETWEEN p_start AND p_end

  UNION ALL
  -- 2) Helper-channel sales: customer pays helper cash → helper tops up user coins.
  --    Company revenue = sale USD MINUS helper commission (helper keeps commission).
  SELECT 'helper_order'::text, 'Helper Channel Sales (net of commission)'::text,
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0) - COALESCE(ho.commission_amount,0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(ho.commission_amount,0)),0)::numeric,4),
    0::numeric,
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0) - COALESCE(ho.commission_amount,0)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.helper_orders ho
  WHERE ho.status IN ('completed','approved','delivered')
    AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end

  UNION ALL
  -- 3) Agency withdrawal fee — pure company income on cash-out flow
  SELECT 'agency_withdrawal_fee'::text, 'Agency Withdrawal Fees'::text,
    ROUND(COALESCE(SUM(COALESCE(aw.usd_amount, aw.amount) * COALESCE(aw.fee_percentage,0)/100.0),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(aw.usd_amount, aw.amount) * COALESCE(aw.fee_percentage,0)/100.0),0)::numeric,4),
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(aw.usd_amount, aw.amount) * COALESCE(aw.fee_percentage,0)/100.0),0)::numeric,4),
    COUNT(*)::bigint, 100::numeric
  FROM public.agency_withdrawals aw
  WHERE aw.status IN ('completed','approved','paid')
    AND COALESCE(aw.processed_at, aw.requested_at) BETWEEN p_start AND p_end

  UNION ALL
  -- 4) VIP subscriptions paid in USD (gateway-fee deducted)
  SELECT 'vip_subscription'::text, 'VIP Subscriptions'::text,
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric * (1 - v_vip_gateway_pct/100.0),4),
    0::numeric,
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric * (v_vip_gateway_pct/100.0),4),
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric * (1 - v_vip_gateway_pct/100.0),4),
    COUNT(*)::bigint, (100 - v_vip_gateway_pct)::numeric
  FROM public.user_vip_subscriptions uvs
  WHERE uvs.created_at BETWEEN p_start AND p_end

  UNION ALL
  -- 5) Generic subscription orders (USD)
  SELECT 'subscription_order'::text, 'Subscription Orders'::text,
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric * (1 - v_sub_gateway_pct/100.0),4),
    0::numeric,
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric * (v_sub_gateway_pct/100.0),4),
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric * (1 - v_sub_gateway_pct/100.0),4),
    COUNT(*)::bigint, (100 - v_sub_gateway_pct)::numeric
  FROM public.subscription_orders so
  WHERE so.status IN ('completed','approved','paid')
    AND so.created_at BETWEEN p_start AND p_end

  -- ============ REAL CASH PAYOUTS (negative profit lines) ============
  UNION ALL
  -- 6) Agency cash withdrawals (USD leaving company)
  SELECT 'payout_agency_withdrawal'::text, '(−) Agency Withdrawals Paid'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(aw.net_amount_money, aw.usd_amount, aw.amount)),0)::numeric,4),
    0::numeric,
    ROUND(-1 * COALESCE(SUM(COALESCE(aw.net_amount_money, aw.usd_amount, aw.amount)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.agency_withdrawals aw
  WHERE aw.status IN ('completed','approved','paid')
    AND COALESCE(aw.processed_at, aw.requested_at) BETWEEN p_start AND p_end

  UNION ALL
  -- 7) Helper cash withdrawals (USD leaving company)
  SELECT 'payout_helper_withdrawal'::text, '(−) Helper Withdrawals Paid'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric,4),
    0::numeric,
    ROUND(-1 * COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.helper_withdrawal_requests hwr
  WHERE hwr.status IN ('completed','approved','paid')
    AND COALESCE(hwr.processed_at, hwr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  -- 8) Host payroll cash payouts (USD leaving company)
  SELECT 'payout_host_payroll'::text, '(−) Host Payroll Paid'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(pr.usd_amount,0)),0)::numeric,4),
    0::numeric,
    ROUND(-1 * COALESCE(SUM(COALESCE(pr.usd_amount,0)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.payroll_requests pr
  WHERE pr.status IN ('completed','approved','paid')
    AND COALESCE(pr.reviewed_at, pr.created_at) BETWEEN p_start AND p_end

  -- ============ INFORMATIONAL COIN ECONOMY (no revenue effect) ============
  -- These are coin spends inside the app. The USD was already booked at recharge.
  -- We show 0 revenue/profit but report transaction count + gross-coin volume in payouts_usd
  -- (as informational coin-USD value) so admins can see activity without double-counting.
  UNION ALL
  SELECT 'info_gift_volume'::text, 'ℹ Gift Coin Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(gt.total_coins, gt.coin_cost * COALESCE(gt.quantity,1), gt.coin_amount * COALESCE(gt.quantity,1), 0)),0)::numeric * v_coin_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.gift_transactions gt
  WHERE gt.created_at BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_private_call_volume'::text, 'ℹ Private Call Coin Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(pc.total_coins_deducted, pc.coins_spent, 0)),0)::numeric * v_coin_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.private_calls pc
  WHERE COALESCE(pc.ended_at, pc.created_at) BETWEEN p_start AND p_end
    AND pc.status IN ('ended','completed','settled')

  UNION ALL
  SELECT 'info_game_volume'::text, 'ℹ Game Coin Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(gt.bet_amount,0)),0)::numeric * v_coin_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.game_transactions gt
  WHERE gt.created_at BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_shop_coin_volume'::text, 'ℹ Coin-Shop Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(CASE WHEN up.currency_type IN ('coin','coins','diamond','diamonds') THEN COALESCE(up.price_paid,0) ELSE 0 END),0)::numeric * v_coin_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.user_purchases up
  WHERE up.purchased_at BETWEEN p_start AND p_end

  ORDER BY 5 DESC NULLS LAST;
END $function$;

-- ============================================================
-- Payouts function — only REAL cash USD payouts. Informational
-- diamond/coin transfers shown separately to avoid inflation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_payouts_for_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(category_key text, display_name text, payout_usd numeric, payout_diamonds numeric, transaction_count bigint, recipient_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_coin_rate NUMERIC;
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  v_coin_rate := public.get_official_coin_usd_rate();

  RETURN QUERY
  -- REAL USD CASH-OUTS
  SELECT 'agency_withdrawal'::text, 'Agency Withdrawals (cash out)'::text,
         ROUND(COALESCE(SUM(COALESCE(aw.net_amount_money, aw.usd_amount, aw.amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(aw.net_diamonds_to_helper,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT aw.agency_id)::bigint
  FROM public.agency_withdrawals aw
  WHERE aw.status IN ('completed','approved','paid')
    AND COALESCE(aw.processed_at, aw.requested_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'helper_withdrawal'::text, 'Helper Withdrawals (cash out)'::text,
         ROUND(COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(hwr.diamond_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT hwr.helper_id)::bigint
  FROM public.helper_withdrawal_requests hwr
  WHERE hwr.status IN ('completed','approved','paid')
    AND COALESCE(hwr.processed_at, hwr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'host_payroll'::text, 'Host Payroll (cash out)'::text,
         ROUND(COALESCE(SUM(COALESCE(pr.usd_amount,0)),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT pr.user_id)::bigint
  FROM public.payroll_requests pr
  WHERE pr.status IN ('completed','approved','paid')
    AND COALESCE(pr.reviewed_at, pr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'helper_commission'::text, 'Helper Order Commissions (USD retained by helper)'::text,
         ROUND(COALESCE(SUM(COALESCE(ho.commission_amount,0)),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT ho.helper_id)::bigint
  FROM public.helper_orders ho
  WHERE ho.status IN ('completed','approved','delivered')
    AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end

  -- INFORMATIONAL — internal diamond/coin transfers (NOT real USD cash out)
  UNION ALL
  SELECT 'info_helper_topup'::text, 'ℹ Diamonds Issued to Helpers (internal)'::text,
         0::numeric,
         COALESCE(SUM(COALESCE(htr.coin_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT htr.helper_id)::bigint
  FROM public.helper_topup_requests htr
  WHERE htr.status IN ('completed','approved')
    AND COALESCE(htr.processed_at, htr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_agency_host_transfer'::text, 'ℹ Agency→Host Earnings (internal)'::text,
         0::numeric, 0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT aet.host_id)::bigint
  FROM public.agency_earnings_transfers aet
  WHERE COALESCE(aet.processed_at, aet.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_beans_exchange'::text, 'ℹ Beans→Diamonds Exchange (internal)'::text,
         0::numeric,
         COALESCE(SUM(COALESCE(ube.diamonds_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT ube.user_id)::bigint
  FROM public.user_beans_exchanges ube
  WHERE ube.status IN ('completed','approved')
    AND COALESCE(ube.completed_at, ube.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_game_winnings'::text, 'ℹ Game Winnings (internal coin payout)'::text,
         0::numeric,
         COALESCE(SUM(COALESCE(gt.win_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT gt.user_id)::bigint
  FROM public.game_transactions gt
  WHERE gt.created_at BETWEEN p_start AND p_end AND COALESCE(gt.win_amount,0) > 0;
END $function$;
